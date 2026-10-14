// src/components/AppSplash.tsx
// The branded launch splash. The native splash (expo-splash-screen plugin in app.json) is background-only — it
// renders before JS, so it can only follow the *system* colour scheme, never an in-app "force dark/light" choice.
// Everything brand-related therefore lives here, painted once the theme is known: the mudcloth motif, a soft glow
// and the wordmark. Mounted by the root layout (Shell) over the app; it fades out once `ready` AND it has been
// visible for MIN_VISIBLE_MS, then calls `onFinished` so the layout can unmount it.
import { useEffect, useRef } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { PatternBackground } from "@/components/ui/PatternBackground";
import { useTheme } from "@/theme/ThemeProvider";

// Glow peaks are lower in light mode because a strong glow on off-white reads muddy.
const MIN_VISIBLE_MS = 1300;
const GLOW_PEAK = { dark: 0.55, light: 0.28 } as const;
const BREATH_MS = 2800;
const LOGO_WIDTH = { min: 200, max: 280, ratio: 0.58 } as const;
const MOTIF_OPACITY = 0.05;
// Optical centering: the logo sits slightly above true screen centre.
const OPTICAL_LIFT_RATIO = 0.02;

// Baked by scripts/build-splash-assets.py from the tagline-free app icons.
const LOGO_ASSETS = {
  light: require("../../assets/images/splash-logo-light.png"),
  dark: require("../../assets/images/splash-logo-dark.png"),
} as const;
const GLOW_ASSETS = {
  light: require("../../assets/images/splash-glow-light.png"),
  dark: require("../../assets/images/splash-glow-dark.png"),
} as const;
// The same 7×7 / 29-motif grid the Login and Sign-up screens use.
const MOTIF_TILE = require("../../assets/patterns/auth-pattern-tile.png");

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function AppSplash({ ready, onFinished }: { ready: boolean; onFinished: () => void }) {
  const reduced = useReducedMotion();
  const { colors, resolvedTheme } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const logoSource = LOGO_ASSETS[theme];
  const glowSource = GLOW_ASSETS[theme];
  const glowPeak = GLOW_PEAK[theme];

  // Baked assets carry their natural pixel size (Metro packages it with the asset), so the glow is scaled by
  // exactly the same factor as the logo instead of guessing a fixed offset — its canvas is intentionally larger
  // than the logo's (see scripts/build-splash-assets.py) so the blur is never clipped.
  const logoMeta = Image.resolveAssetSource(logoSource);
  const glowMeta = Image.resolveAssetSource(glowSource);
  const logoWidth = clamp(screenWidth * LOGO_WIDTH.ratio, LOGO_WIDTH.min, LOGO_WIDTH.max);
  const logoHeight = logoWidth * (logoMeta.height / logoMeta.width);
  const scaleFactor = logoWidth / logoMeta.width;
  const glowWidth = glowMeta.width * scaleFactor;
  const glowHeight = glowMeta.height * scaleFactor;
  const opticalLift = screenHeight * OPTICAL_LIFT_RATIO;

  const motifOpacity = useSharedValue(reduced ? 1 : 0);
  const logoOpacity = useSharedValue(reduced ? 1 : 0);
  const logoTranslateY = useSharedValue(reduced ? 0 : 6);
  const logoScale = useSharedValue(reduced ? 1 : 0.985);
  const glowOpacity = useSharedValue(reduced ? glowPeak * 0.8 : 0);
  const shellOpacity = useSharedValue(1);

  const mountedAt = useRef(Date.now());
  const finishedRef = useRef(false);

  useEffect(() => {
    if (reduced) {
      motifOpacity.value = withTiming(1, { duration: 200 });
      logoOpacity.value = withTiming(1, { duration: 200 });
      // logoTranslateY / logoScale stay put — reduced motion never translates or scales.
      glowOpacity.value = withTiming(glowPeak * 0.8, { duration: 200 });
      return;
    }

    motifOpacity.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });

    logoOpacity.value = withDelay(150, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    logoTranslateY.value = withDelay(150, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
    logoScale.value = withDelay(150, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));

    glowOpacity.value = withDelay(
      450,
      withTiming(glowPeak, { duration: 800, easing: Easing.out(Easing.cubic) }, (finished) => {
        "worklet";
        if (!finished) return;
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(glowPeak * 0.6, { duration: BREATH_MS / 2, easing: Easing.inOut(Easing.sin) }),
            withTiming(glowPeak, { duration: BREATH_MS / 2, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
        );
      }),
    );

    return () => {
      cancelAnimation(glowOpacity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme-derived glowPeak intentionally re-runs the entrance if the theme flips mid-splash
  }, [reduced, glowPeak]);

  useEffect(() => {
    if (!ready || finishedRef.current) return;
    finishedRef.current = true;
    const elapsed = Date.now() - mountedAt.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const exitDuration = reduced ? 150 : 320;
    shellOpacity.value = withDelay(
      wait,
      withTiming(0, { duration: exitDuration, easing: Easing.inOut(Easing.quad) }, (finished) => {
        "worklet";
        if (finished) scheduleOnRN(onFinished);
      }),
    );
  }, [onFinished, ready, reduced, shellOpacity]);

  const shellStyle = useAnimatedStyle(() => ({ opacity: shellOpacity.value }));
  const motifStyle = useAnimatedStyle(() => ({ opacity: motifOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoTranslateY.value }, { scale: logoScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  return (
    <Animated.View
      accessibilityLabel="Akọ is starting"
      style={[StyleSheet.absoluteFill, styles.shell, { backgroundColor: colors.canvas }, shellStyle]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, motifStyle]}>
        <PatternBackground tile={MOTIF_TILE} opacity={MOTIF_OPACITY} />
      </Animated.View>

      {/* Vignette: opaque canvas behind the logo, fading to transparent toward the edges, so the motif reads
          quietly behind the wordmark and stays visible at the screen's edges. */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="splashVignette" cx="50%" cy="50%" r="75%">
            <Stop offset="0%" stopColor={colors.canvas} stopOpacity={0.92} />
            <Stop offset="100%" stopColor={colors.canvas} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#splashVignette)" />
      </Svg>

      <View style={[styles.center, { transform: [{ translateY: -opticalLift }] }]} pointerEvents="none">
        <Animated.Image
          source={glowSource}
          resizeMode="contain"
          style={[styles.glow, { width: glowWidth, height: glowHeight }, glowStyle]}
        />
        <Animated.View style={logoStyle}>
          <Image source={logoSource} resizeMode="contain" style={{ width: logoWidth, height: logoHeight }} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: { zIndex: 1000 },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute" },
});
