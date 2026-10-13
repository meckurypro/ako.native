// src/components/nav/AutoHideTopBar.tsx
// Header that slides away while you scroll down and returns on scroll up — in
// step with the bottom nav (both follow the shared `hidden` value in
// ChromeProvider). It floats over the screen, so lists below must pad their
// content by `useTopBarInset()` to start beneath it.
import { BlurView } from "expo-blur";
import { useEffect, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";
import { useChrome } from "./ChromeProvider";

export function AutoHideTopBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors, resolvedTheme } = useTheme();
  const { hidden, topBarHeight, setTopBarHeight } = useChrome();

  // The bar belongs to this screen only; clear the measurement when it goes away.
  useEffect(() => () => setTopBarHeight(0), [setTopBarHeight]);

  // Web: slides up out of the way AND fades (-translate-y-full + opacity-0, 300ms ease-out).
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(-hidden.value * (topBarHeight + 8), { duration: 300, easing: Easing.out(Easing.cubic) }) }],
    opacity: withTiming(1 - hidden.value, { duration: 300 }),
  }));

  // Android: the bar lives inside the screen, which is itself the nav's blur
  // target, and a BlurView can't sit inside its own target — so there it falls
  // back to a denser translucent fill (no blur) instead of letting crisp content
  // ghost through. iOS gets the real blur.
  const fill = Platform.OS === "android" ? "EB" : "CC";

  return (
    <Animated.View
      pointerEvents="box-none"
      onLayout={(e) => setTopBarHeight(e.nativeEvent.layout.height)}
      // Inline style: className backgrounds don't resolve reliably on device.
      // Web: sticky top-0 z-20 bg-surface/80 backdrop-blur-md
      // shadow-[0_2px_8px_-4px_ink@10%].
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          zIndex: 30,
          shadowColor: `rgb(${colors.shadowInkRgb})`,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        style,
      ]}
    >
      <BlurView
        pointerEvents="none"
        intensity={50}
        tint={resolvedTheme === "dark" ? "dark" : "light"}
        blurMethod="none"
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${colors.surface}${fill}` }]} />
      <View style={{ paddingTop: insets.top }}>{children}</View>
    </Animated.View>
  );
}

/** Top padding a scrolling list needs to start below the floating AutoHideTopBar. */
export function useTopBarInset(): number {
  return useChrome().topBarHeight;
}
