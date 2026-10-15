// src/components/ui/KeyboardAvoider.tsx
// Keeps content clear of the on-screen keyboard — the one replacement for every
// <KeyboardAvoidingView>.
//
// Why not KeyboardAvoidingView: with Android edge-to-edge (mandatory on SDK 57) the window no longer
// resizes for the keyboard, and KAV's Android modes either do nothing (`behavior` undefined — what most
// screens here had) or miscompute the overlap, so inputs sank under the keyboard. Reanimated's
// `useAnimatedKeyboard` reads the real IME inset on both platforms and updates every frame, so this pads
// the bottom of the container by exactly the keyboard's height, in step with the keyboard animation.
//
//   <KeyboardAvoider className="flex-1 bg-canvas">…</KeyboardAvoider>
//
// `useKeyboardHeight()` exposes the same shared value for the rare layout that needs it directly
// (e.g. capping a sheet's height to the space the keyboard leaves).
import type { ReactNode } from "react";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle, type SharedValue } from "react-native-reanimated";

/** The keyboard's current height (0 when hidden) as a shared value. */
export function useKeyboardHeight(): SharedValue<number> {
  return useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true }).height;
}

interface KeyboardAvoiderProps extends Omit<ViewProps, "style" | "children"> {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Turn the avoidance off without unmounting (e.g. while an emoji tray stands in for the keyboard). */
  enabled?: boolean;
  /**
   * Space the container already reserves at its bottom (a safe-area inset, say). The keyboard overlaps
   * it, so it is subtracted — otherwise the content floats that far above the keyboard.
   */
  reservedBottom?: number;
}

export function KeyboardAvoider({ children, className, style, enabled = true, reservedBottom = 0, ...rest }: KeyboardAvoiderProps) {
  const height = useKeyboardHeight();
  const animated = useAnimatedStyle(() => ({
    paddingBottom: enabled ? Math.max(0, height.value - reservedBottom) : 0,
  }));
  return (
    <Animated.View className={className} style={[style, animated]} {...rest}>
      {children}
    </Animated.View>
  );
}
