// src/hooks/useFollowSwap.ts
// Quiet cross-fade for a follow control when its state changes (Follow → Following → Requested…): it settles from a
// hair smaller and a little transparent over 180ms — no overshoot, no bounce. Never plays on first render, and is
// skipped entirely when the OS asks for reduced motion. Spread the returned style on an Animated.View that wraps
// the control. Web equivalent: .ako-follow-swap + useChangePulse.
import { useEffect, useRef } from "react";
import { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

export function useFollowSwap(stateKey: string | number | boolean) {
  const reduceMotion = useReducedMotion();
  const prev = useRef(stateKey);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (prev.current === stateKey) return;
    prev.current = stateKey;
    if (reduceMotion) return;
    scale.value = 0.97;
    opacity.value = 0.55;
    scale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
    opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
  }, [stateKey, reduceMotion, scale, opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
}
