// src/components/ui/PrivacyToggle.tsx
import { EyeOff } from "lucide-react-native";
import { View } from "react-native";

import { Icon } from "./styled";
import { Text } from "./Text";
import { Toggle } from "./Toggle";

interface PrivacyToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function PrivacyToggle({ checked, onChange }: PrivacyToggleProps) {
  return (
    <View className="mb-6 rounded-xl bg-surface p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-3">
          <Icon as={EyeOff} size={18} className="shrink-0 text-ink-muted" />
          <View className="flex-1">
            <Text className="text-sm font-medium text-ink">Private project</Text>
            <Text className="text-xs text-ink-muted">
              Not listed anywhere, and not open to anyone by link — only people you add can see or open it.
            </Text>
          </View>
        </View>
        <Toggle checked={checked} onChange={onChange} accessibilityLabel="Private project" />
      </View>
    </View>
  );
}
