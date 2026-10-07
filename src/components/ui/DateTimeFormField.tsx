// src/components/ui/DateTimeFormField.tsx
// Labelled date-time field for the project forms. Value is the web's
// "YYYY-MM-DDTHH:mm" string (see lib/dateInput.ts); "" means unset.
import { View } from "react-native";

import { dateToLocalInput, localInputToDate } from "@/lib/dateInput";
import { DateTimeField } from "./DateTimeField";
import { Text } from "./Text";

interface DateTimeFormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** Show a "Clear" affordance for optional dates. */
  clearable?: boolean;
}

export function DateTimeFormField({ label, value, onChange, error, clearable }: DateTimeFormFieldProps) {
  return (
    <View className="mb-4">
      <View className="mb-1.5 flex-row items-center justify-between">
        <Text className="text-sm font-medium text-ink-muted">{label}</Text>
        {clearable && value ? (
          <Text accessibilityRole="button" onPress={() => onChange("")} className="text-xs text-accent">
            Clear
          </Text>
        ) : null}
      </View>
      <DateTimeField value={localInputToDate(value)} onChange={(d) => onChange(dateToLocalInput(d))} />
      {error ? <Text className="mt-1.5 text-sm text-danger">{error}</Text> : null}
    </View>
  );
}
