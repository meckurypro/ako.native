// src/hooks/useLongPress.ts
// Native port. The web version hand-rolled pointer events; on React Native the
// Pressable already tells a tap from a hold and cancels when the finger drifts
// into a scroll, so this hook now just adapts its handlers (plus the haptic
// "tick" that replaced navigator.vibrate). Spread the result onto <Pressable>.
import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import type { GestureResponderEvent } from "react-native";

interface LongPressOptions {
  onLongPress: (e: GestureResponderEvent) => void;
  /** Plain tap (fires only when the press was NOT a long press). */
  onClick?: (e: GestureResponderEvent) => void;
  delay?: number; // ms
}

export function useLongPress({ onLongPress, onClick, delay = 450 }: LongPressOptions) {
  const handleLongPress = useCallback(
    (e: GestureResponderEvent) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onLongPress(e);
    },
    [onLongPress]
  );

  return {
    onPress: onClick,
    onLongPress: handleLongPress,
    delayLongPress: delay,
  };
}
