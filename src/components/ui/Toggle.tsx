// src/components/ui/Toggle.tsx
// The app's pill switch (44×24, accent when on) — one primitive behind
// PrivacyToggle and every settings toggle.
import { Pressable } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function Toggle({ checked, onChange, disabled, accessibilityLabel }: ToggleProps) {
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(checked ? 22 : 2, { duration: 150 }) }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onChange(!checked)}
      className={`h-6 w-11 shrink-0 overflow-hidden rounded-full ${checked ? "bg-accent" : "bg-border"} ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <Animated.View className="absolute top-0.5 h-5 w-5 rounded-full bg-canvas" style={knob} />
    </Pressable>
  );
}
