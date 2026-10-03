// src/components/nav/AutoHideTopBar.tsx
// Header that slides away while you scroll down and returns on scroll up — in
// step with the bottom nav (both follow the shared `hidden` value in
// ChromeProvider). It floats over the screen, so lists below must pad their
// content by `useTopBarInset()` to start beneath it.
import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useChrome } from "./ChromeProvider";

export function AutoHideTopBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { hidden, topBarHeight, setTopBarHeight } = useChrome();

  // The bar belongs to this screen only; clear the measurement when it goes away.
  useEffect(() => () => setTopBarHeight(0), [setTopBarHeight]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(-hidden.value * (topBarHeight + 8), { duration: 300, easing: Easing.out(Easing.cubic) }) }],
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 z-30 bg-canvas"
      style={[{ paddingTop: insets.top }, style]}
      onLayout={(e) => setTopBarHeight(e.nativeEvent.layout.height)}
    >
      <View>{children}</View>
    </Animated.View>
  );
}

/** Top padding a scrolling list needs to start below the floating AutoHideTopBar. */
export function useTopBarInset(): number {
  return useChrome().topBarHeight;
}
