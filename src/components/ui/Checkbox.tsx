// src/components/ui/Checkbox.tsx
// Square checkbox with a label to its right (web: <label><input type=checkbox>…).
import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "./styled";
import { Text } from "./Text";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      className={`flex-row items-center gap-2 ${disabled ? "opacity-50" : ""}`}
    >
      <View className={`h-5 w-5 items-center justify-center rounded border ${checked ? "border-accent bg-accent" : "border-border bg-canvas"}`}>
        {checked ? <Icon as={Check} size={13} strokeWidth={3} className="text-canvas" /> : null}
      </View>
      <Text className="flex-1 text-sm text-ink">{label}</Text>
    </Pressable>
  );
}
