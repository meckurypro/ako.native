// src/components/ui/SettingsSection.tsx
// Collapsible settings group. Open state is controlled by the parent so it can
// enforce "only one section open at a time". The panel animates its height
// (300ms) and the chevron flips (200ms), like the web's grid-rows transition.
import { ChevronDown } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";

import { Icon } from "./styled";
import { Text } from "./Text";

interface SettingsSectionProps {
  icon: ReactNode;
  title: string;
  /** Short collapsed-state preview, e.g. "System" or "Private". */
  summary?: string;
  open: boolean;
  onToggle: () => void;
  /** Red-tinted header for destructive/irreversible settings. */
  danger?: boolean;
  children: ReactNode;
}

export function SettingsSection({ icon, title, summary, open, onToggle, danger = false, children }: SettingsSectionProps) {
  // Content is laid out absolutely at its natural height so we can measure it,
  // while the visible wrapper animates between 0 and that height.
  const [contentHeight, setContentHeight] = useState(0);

  const panelStyle = useAnimatedStyle(() => ({
    height: withTiming(open ? contentHeight : 0, { duration: 300, easing: Easing.out(Easing.cubic) }),
  }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(open ? "180deg" : "0deg", { duration: 200 }) }],
  }));

  return (
    <View className="overflow-hidden rounded-2xl bg-surface">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-3 p-4"
      >
        <View>{icon}</View>
        <Text className={`min-w-0 flex-1 text-sm font-medium ${danger ? "text-danger" : "text-ink"}`}>{title}</Text>
        {summary && !open ? (
          <Text numberOfLines={1} className="max-w-[40%] text-xs text-ink-muted">
            {summary}
          </Text>
        ) : null}
        <Animated.View style={chevronStyle}>
          <Icon as={ChevronDown} size={18} className="shrink-0 text-ink-muted" />
        </Animated.View>
      </Pressable>

      <Animated.View style={[{ overflow: "hidden" }, panelStyle]}>
        <View
          style={{ position: "absolute", left: 0, right: 0, top: 0 }}
          onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
        >
          <View className="border-t border-border px-4 pb-5 pt-1">{children}</View>
        </View>
      </Animated.View>
    </View>
  );
}
