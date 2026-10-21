// src/components/ui/SelectField.tsx
// The native stand-in for a <select>: a field showing the current choice that
// opens a bottom sheet of options.
import { Check, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { OptionsModal } from "./OptionsModal";
import { Icon } from "./styled";
import { Text } from "./Text";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SelectField({ label, value, options, onChange, placeholder = "Select…" }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View>
      <Text className="mb-1 text-xs font-medium text-ink-muted">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        className="flex-row items-center justify-between rounded-xl bg-surface px-4 py-3"
      >
        <Text numberOfLines={1} className={`flex-1 text-sm ${current ? "text-ink" : "text-ink-muted"}`}>
          {current?.label ?? placeholder}
        </Text>
        <Icon as={ChevronDown} size={16} className="ml-2 text-ink-muted" />
      </Pressable>

      {open ? (
        <OptionsModal
          title={label}
          onClose={() => setOpen(false)}
          items={options.map((o) => ({
            key: o.value || "__none",
            label: o.label,
            icon: o.value === value ? <Icon as={Check} size={22} className="text-overlay-accent" /> : undefined,
            onSelect: () => onChange(o.value),
          }))}
        />
      ) : null}
    </View>
  );
}
