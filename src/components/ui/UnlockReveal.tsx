// src/components/ui/UnlockReveal.tsx
// Wraps project content gated behind a purchase/unlock. Plays a soft
// "reveal" only on the false→true transition — the moment a purchase
// completes and access flips — never on ordinary re-renders, and never for
// content already unlocked when the card first mounted (owner's own project,
// an earlier purchase, a free project).
//
// The web build also animates a 14px blur → sharp. React Native has no
// cross-platform blur filter for arbitrary views, so the native reveal is the
// scale + fade part of that animation (0.4 → 1 opacity, 1.02 → 1 scale).
import { useEffect, useRef, type ReactNode } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface UnlockRevealProps {
  /** Whether the gated content is currently accessible. */
  unlocked: boolean;
  children: ReactNode;
}

export function UnlockReveal({ unlocked, children }: UnlockRevealProps) {
  const reduceMotion = useReducedMotion();
  const prevUnlocked = useRef<boolean | null>(null);
  const progress = useSharedValue(1);

  useEffect(() => {
    if (prevUnlocked.current !== null && unlocked && !prevUnlocked.current && !reduceMotion) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: 520, easing: Easing.bezier(0.22, 1, 0.36, 1) });
    }
    prevUnlocked.current = unlocked;
  }, [unlocked, reduceMotion, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + 0.6 * progress.value,
    transform: [{ scale: 1.02 - 0.02 * progress.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
