// src/components/ui/LikeHeart.tsx
// Drop-in like icon. Animates only on the false→true transition (liking, never
// un-liking, never on first mount): a quick overshoot "pop" plus a small burst
// of sparks, so a like reads as a tiny rewarded moment rather than a colour
// swap. Used by PostCard, ProjectCard and CommentSheet.
import { Heart } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { textColorFromClassName } from "@/lib/colorClass";
import { useTheme } from "@/theme/ThemeProvider";

interface LikeHeartProps {
  active: boolean;
  size?: number;
  /** Colour class, e.g. "text-danger". Defaults to muted ink. */
  className?: string;
}

const SPARK_COUNT = 6;
const SPARK_RADIUS = 15;

function Spark({ index, color }: { index: number; color: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) });
  }, [progress]);

  const rad = (((360 / SPARK_COUNT) * index) * Math.PI) / 180;
  const x = Math.cos(rad) * SPARK_RADIUS;
  const y = Math.sin(rad) * SPARK_RADIUS;

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateX: x * progress.value }, { translateY: y * progress.value }, { scale: 1 - progress.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", top: "50%", left: "50%", width: 5, height: 5, marginTop: -2.5, marginLeft: -2.5, borderRadius: 3, backgroundColor: color },
        style,
      ]}
    />
  );
}

export function LikeHeart({ active, size = 24, className }: LikeHeartProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const color = textColorFromClassName(className, colors) ?? colors.inkMuted;

  const wasActive = useRef(active);
  const [animating, setAnimating] = useState(false);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (active && !wasActive.current && !reduceMotion) {
      setAnimating(true);
      // 1 → 1.32 → 0.94 → 1 over ~380ms (the web's ako-like-pop keyframes)
      scale.value = withSequence(
        withTiming(1.32, { duration: 133, easing: Easing.out(Easing.back(1.5)) }),
        withTiming(0.94, { duration: 95 }),
        withTiming(1, { duration: 152 })
      );
      const timer = setTimeout(() => setAnimating(false), 500);
      wasActive.current = active;
      return () => clearTimeout(timer);
    }
    wasActive.current = active;
  }, [active, reduceMotion, scale]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={popStyle}>
        <Heart size={size} color={color} fill={active ? color : "none"} />
      </Animated.View>
      {animating
        ? Array.from({ length: SPARK_COUNT }).map((_, i) => <Spark key={i} index={i} color={color} />)
        : null}
    </View>
  );
}
