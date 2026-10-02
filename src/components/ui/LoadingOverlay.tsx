// src/components/ui/LoadingOverlay.tsx
// Full-screen blocking spinner shown while any mutation flagged
// `meta: { blocking: true }` is in flight — same trigger as web. Eight dots
// fade in sequence around a circle while the whole ring gently "breathes".
import { useIsMutating } from "@tanstack/react-query";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";

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

  if (blockingCount === 0) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(120)}
      accessibilityRole="progressbar"
      accessibilityLabel="Saving"
      style={[StyleSheet.absoluteFill, { zIndex: 999, alignItems: "center", justifyContent: "center" }]}
      // Swallow touches so nothing underneath can be triggered mid-save.
      pointerEvents="auto"
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas, opacity: 0.55 }]} />
      <Animated.View style={[{ width: 34, height: 34 }, ringStyle]}>
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <Dot key={i} index={i} color={colors.accent} />
        ))}
      </Animated.View>
    </Animated.View>
  );
}
