// src/components/course/ProgressBar.tsx
// Course progress bar whose fill glides to its new width instead of jumping.
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useTheme } from "@/theme/ThemeProvider";

export function ProgressBar({ pct, height = 6 }: { pct: number; height?: number }) {
  const { colors } = useTheme();
  const width = useSharedValue(pct);

  useEffect(() => {
    width.value = withTiming(pct, { duration: 450 });
  }, [pct, width]);

  const fill = useAnimatedStyle(() => ({ width: `${width.value}%` as `${number}%` }));

  return (
    <View className="overflow-hidden rounded-full bg-border" style={{ height }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: colors.accent }, fill]} />
    </View>
  );
}
