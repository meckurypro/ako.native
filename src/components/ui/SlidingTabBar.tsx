// src/components/ui/SlidingTabBar.tsx
// The text tab strip shared by Library, Connect and Discover's search results — the same look and motion as the
// Profile's and Feed's tab rows: equal-width columns and ONE sliding indicator, not a border per tab.
// Pass `progress` (SwipeableTabs' shared value) and the bar follows the finger on the UI thread; without it
// (SwipeToSwitch screens) the bar springs to the active tab.
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, withTiming, type SharedValue } from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { Text } from "./Text";

interface SlidingTabBarProps {
  tabs: readonly { id: string; label: string }[];
  activeIndex: number;
  onSelect: (index: number) => void;
  progress?: SharedValue<number>;
  className?: string;
}

export function SlidingTabBar({ tabs, activeIndex, onSelect, progress, className = "" }: SlidingTabBarProps) {
  const [barWidth, setBarWidth] = useState(0);
  const cell = barWidth / Math.max(tabs.length, 1);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress ? progress.value * cell : withTiming(activeIndex * cell, { duration: 280, easing: Easing.out(Easing.cubic) }) }],
  }));

  return (
    <View accessibilityRole="tablist" className={`relative flex-row items-stretch border-b border-border ${className}`} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
      {tabs.map((t, i) => (
        <Pressable
          key={t.id}
          onPress={() => {
            if (i === activeIndex) return;
            haptics.selection();
            onSelect(i);
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === activeIndex }}
          className="h-11 flex-1 items-center justify-center"
        >
          <Text numberOfLines={1} className={`text-sm font-semibold ${i === activeIndex ? "text-accent" : "text-ink-muted"}`}>
            {t.label}
          </Text>
        </Pressable>
      ))}
      <Animated.View pointerEvents="none" className="absolute bottom-0 left-0 h-[3px] items-center" style={[{ width: cell }, indicatorStyle]}>
        <View className="h-full w-9 rounded-full bg-accent" />
      </Animated.View>
    </View>
  );
}
