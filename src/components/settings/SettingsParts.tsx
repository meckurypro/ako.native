// src/components/settings/SettingsParts.tsx
// Rows shared by the Settings sections: a toggle row and a single-choice option list.
import { Check, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Toggle } from "@/components/ui/Toggle";

interface ToggleRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  pending?: boolean;
  error?: string | null;
}

export function ToggleRow({ icon, title, description, checked, onToggle, pending = false, error }: ToggleRowProps) {
  return (
    <View className="mb-3 rounded-xl bg-canvas p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          <Icon as={icon} size={18} className="text-ink-muted" />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-medium text-ink">{title}</Text>
            <Text className="text-xs text-ink-muted">{description}</Text>
          </View>
        </View>
        <Toggle checked={checked} onChange={onToggle} disabled={pending} accessibilityLabel={title} />
      </View>
      {error ? <Text className="mt-2 text-xs text-danger">{error}</Text> : null}
    </View>
  );
}

export interface OptionRowData<T extends string> {
  value: T;
  label: string;
  description: string;
  icon: LucideIcon;
}

export function OptionList<T extends string>({ options, value, onSelect }: { options: OptionRowData<T>[]; value: T; onSelect: (value: T) => void }) {
  return (
    <View className="mt-3 overflow-hidden rounded-xl border border-border">
      {options.map((opt, i) => (
        <Pressable
          key={opt.value}
          onPress={() => onSelect(opt.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === opt.value }}
          className={`flex-row items-center gap-3 bg-canvas p-4 ${i > 0 ? "border-t border-border" : ""}`}
        >
          <Icon as={opt.icon} size={18} className="text-ink-muted" />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-medium text-ink">{opt.label}</Text>
            <Text className="text-xs text-ink-muted">{opt.description}</Text>
          </View>
          {value === opt.value && <Icon as={Check} size={18} className="text-accent" />}
        </Pressable>
      ))}
    </View>
  );
}
