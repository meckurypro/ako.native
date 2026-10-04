// src/components/ui/SelectField.tsx
// The native stand-in for a <select>: a field showing the current choice that
// opens a bottom sheet of options.
import { Check, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Sheet } from "./Sheet";
import { SheetCancel, SheetRow } from "./SheetParts";
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
        <Sheet onClose={() => setOpen(false)} dragZone="handle" maxHeightRatio={0.7} accessibilityLabel={label}>
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            {options.map((o) => (
              <SheetRow
                key={o.value || "__none"}
                label={o.label}
                onPress={() => onChange(o.value)}
                icon={o.value === value ? <Icon as={Check} size={16} className="text-accent" /> : undefined}
              />
            ))}
          </ScrollView>
          <SheetCancel />
        </Sheet>
      ) : null}
    </View>
  );
}
