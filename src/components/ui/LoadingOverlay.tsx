// src/components/ui/LoadingOverlay.tsx
// Full-screen blocking spinner shown while any mutation flagged
// `meta: { blocking: true }` is in flight — same trigger as web — and, touch-through, while a newly opened page is
// still loading its first data (usePageLoading). Eight dots
// fade in sequence around a circle while the whole ring gently "breathes".
import { useIsMutating } from "@tanstack/react-query";
import { usePathname } from "expo-router";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { usePageLoading } from "@/hooks/usePageLoading";
import { LOADING_BLUR_INTENSITY } from "@/theme/blur";
import { useTheme } from "@/theme/ThemeProvider";
import { GlassScrim } from "./GlassScrim";
import { Portal } from "./Portal";

const DOT_COUNT = 8;
const RING_RADIUS = 15;

function Dot({ index, color }: { index: number; color: string }) {
  const opacity = useSharedValue(0.15);

  useEffect(() => {
    // Negative CSS animation-delay = start mid-cycle; emulate by offsetting the phase.
    const phase = (index / DOT_COUNT) * 1000;
    opacity.value = withDelay(
      phase,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.15, { duration: 500, easing: Easing.inOut(Easing.quad) })
        ),
        -1
      )
    );
  }, [index, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const angle = (index * 360) / DOT_COUNT;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 17 - 2,
          left: 17 - 2,
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
          transform: [{ rotate: `${angle}deg` }, { translateY: -RING_RADIUS }],
        },
        style,
      ]}
    />
  );
}

export function LoadingOverlay() {
  const { colors } = useTheme();
  const blockingCount = useIsMutating({
    predicate: (mutation) => mutation.options.meta?.blocking === true,
  });

  // Also shown (touch-through) while the page just opened is still loading its first data.
  const pageLoading = usePageLoading(usePathname());

  const scale = useSharedValue(0.94);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0.94, { duration: 900, easing: Easing.inOut(Easing.cubic) })
      ),
      -1
    );
  }, [scale]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (blockingCount === 0 && !pageLoading) return null;

  // A Portal layer above GLASS_ABOVE_Z so GlassScrim can really blur the app beneath (web: z-[999],
  // bg-canvas/35 + backdrop-blur-sm). The layer fades out via the Portal host.
  return (
    <Portal zIndex={999}>
      <Animated.View
        entering={FadeIn.duration(180)}
        accessibilityRole="progressbar"
        accessibilityLabel={blockingCount > 0 ? "Saving" : "Loading"}
        style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}
        // Swallow touches so nothing underneath can be triggered mid-save.
        pointerEvents={blockingCount > 0 ? "auto" : "none"}
      >
        <GlassScrim tone="canvasFaint" intensity={LOADING_BLUR_INTENSITY} />
        <Animated.View style={[{ width: 34, height: 34 }, ringStyle]}>
          {Array.from({ length: DOT_COUNT }).map((_, i) => (
            <Dot key={i} index={i} color={colors.accent} />
          ))}
        </Animated.View>
      </Animated.View>
    </Portal>
  );
}
