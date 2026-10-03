// src/components/ui/Skeleton.tsx
// Pulsing placeholder block (web: animate-pulse bg-surface).
import { useEffect } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

export function Skeleton({ className = "" }: { className?: string }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.5, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style} className={`bg-surface ${className}`} />;
}
