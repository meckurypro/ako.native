// src/components/ui/AnimatedCount.tsx
// A number that rolls when it changes. Going up: the old number scrolls up and out while the new one rises in from
// below with a small bounce. Going down: the same, mirrored (old exits downward, new drops in from above).
// Minimal on purpose — one number, one short move, no colour or scale change.
//
// A count of 0 renders nothing unless `showZero` (so 0→1 animates in and 1→0 animates out, then the slot
// disappears and no gap is left). Pass the raw count; callers no longer need to hide zeros themselves.
// `lineHeight` is the clip window and the distance travelled — match it to the text size (text-xs ≈ 16, text-sm ≈ 20).
import { useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { Text } from "@/components/ui/Text";
import { formatCompactCount } from "@/lib/formatStats";

const OUT_MS = 170;

const fmt = (n: number, showZero: boolean) => (n > 0 ? formatCompactCount(n) : showZero ? "0" : "");

export function AnimatedCount({
  value,
  className = "",
  lineHeight = 18,
  showZero = false,
}: {
  value: number;
  className?: string;
  lineHeight?: number;
  showZero?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const last = useRef(value);
  const [leaving, setLeaving] = useState<string | null>(null);

  const enterY = useSharedValue(0);
  const enterO = useSharedValue(1);
  const exitY = useSharedValue(0);
  const exitO = useSharedValue(0);

  // Layout effect: the shared values are set before the changed number is first drawn, so there is never a frame
  // with the new number sitting at rest before it jumps to the animation's start.
  useLayoutEffect(() => {
    if (last.current === value) return;
    const dir = value > last.current ? 1 : -1;
    const prevText = fmt(last.current, showZero);
    last.current = value;
    if (reduceMotion) {
      setLeaving(null);
      return;
    }

    // New number: from below (up) / above (down), overshoots a hair, settles.
    enterY.value = dir * lineHeight;
    enterO.value = 0;
    enterO.value = withTiming(1, { duration: 120 });
    enterY.value = withSpring(0, { damping: 13, stiffness: 320, mass: 0.6 });

    // Old number: out the opposite way.
    if (prevText !== "") {
      setLeaving(prevText);
      exitY.value = 0;
      exitO.value = 1;
      exitY.value = withTiming(-dir * lineHeight, { duration: OUT_MS, easing: Easing.in(Easing.quad) });
      exitO.value = withTiming(0, { duration: OUT_MS }, (finished) => {
        if (finished) scheduleOnRN(setLeaving, null);
      });
    } else {
      setLeaving(null);
    }
  }, [value, showZero, lineHeight, reduceMotion, enterY, enterO, exitY, exitO]);

  const enterStyle = useAnimatedStyle(() => ({ opacity: enterO.value, transform: [{ translateY: enterY.value }] }));
  const exitStyle = useAnimatedStyle(() => ({ opacity: exitO.value, transform: [{ translateY: exitY.value }] }));

  const text = fmt(value, showZero);
  // Fully gone (display: none → no layout, so no stray gap in the row) once nothing is showing or leaving.
  const hidden = text === "" && leaving === null;
  const lineStyle = { lineHeight, height: lineHeight } as const;

  return (
    <View style={{ height: lineHeight, overflow: "hidden", display: hidden ? "none" : "flex" }}>
      <Animated.View style={enterStyle}>
        <Text className={className} style={lineStyle}>
          {text}
        </Text>
      </Animated.View>
      {leaving !== null ? (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0 }, exitStyle]}>
          <Text className={className} style={lineStyle}>
            {leaving}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
