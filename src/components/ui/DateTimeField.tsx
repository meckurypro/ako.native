// src/components/ui/DateTimeField.tsx
// Date + time picker. The web used <input type="datetime-local">; native has no
// single control for that:
//   iOS     → an inline date-and-time picker
//   Android → a field that opens the system date dialog, then the time dialog
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Pressable, Platform, View } from "react-native";

import { Text } from "./Text";

interface DateTimeFieldProps {
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  placeholder?: string;
}

function formatValue(date: Date): string {
  return date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DateTimeField({ value, onChange, minimumDate, placeholder = "Pick a date and time" }: DateTimeFieldProps) {
  if (Platform.OS === "ios") {
    return (
      <View className="items-center rounded-xl border border-border bg-surface py-1">
        <DateTimePicker
          value={value ?? minimumDate ?? new Date()}
          mode="datetime"
          display="inline"
          minimumDate={minimumDate}
          onChange={(_e: DateTimePickerEvent, date?: Date) => date && onChange(date)}
          style={{ alignSelf: "stretch" }}
        />
      </View>
    );
  }

  function openAndroid() {
    const start = value ?? minimumDate ?? new Date();
    DateTimePickerAndroid.open({
      value: start,
      mode: "date",
      minimumDate,
      onChange: (e, pickedDate) => {
        if (e.type !== "set" || !pickedDate) return;
        DateTimePickerAndroid.open({
          value: pickedDate,
          mode: "time",
          onChange: (e2, pickedTime) => {
            if (e2.type !== "set" || !pickedTime) return;
            const combined = new Date(pickedDate);
            combined.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
            onChange(combined);
          },
        });
      },
    });
  }

  return (
    <Pressable onPress={openAndroid} accessibilityRole="button" className="rounded-xl border border-border bg-surface px-4 py-3">
      <Text className={`text-sm ${value ? "text-ink" : "text-ink-muted"}`}>{value ? formatValue(value) : placeholder}</Text>
    </Pressable>
  );
}
