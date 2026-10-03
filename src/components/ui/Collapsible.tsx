// src/components/ui/Collapsible.tsx
// Height-animated open/close wrapper (web: grid-rows 0fr↔1fr, 300ms).
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, withTiming } from "react-native-reanimated";

export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const [contentHeight, setContentHeight] = useState(0);
  const style = useAnimatedStyle(() => ({
    height: withTiming(open ? contentHeight : 0, { duration: 300, easing: Easing.inOut(Easing.cubic) }),
  }));

  return (
    <Animated.View style={[{ overflow: "hidden" }, style]}>
      {/* Laid out absolutely at natural height so it can be measured while the wrapper is collapsed. */}
      <View style={{ position: "absolute", left: 0, right: 0, top: 0 }} onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}>
        {children}
      </View>
    </Animated.View>
  );
}
