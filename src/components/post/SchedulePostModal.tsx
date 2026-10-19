// src/components/post/SchedulePostModal.tsx
// "Schedule post" — deliberately minimal: a Date field, a Time field, one line confirming when it goes live.
// Pre-filled with tomorrow 9:00 AM so the button always works. Android opens the system date then time dialog;
// iOS shows compact native pickers.
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { Modal } from "@/components/ui/Modal";
import { Text } from "@/components/ui/Text";
import { defaultSchedule, formatDate, formatScheduleShort, formatTime, isFarEnough, MIN_SCHEDULE_LEAD_MS } from "@/lib/schedulePresets";

interface SchedulePostModalProps {
  onClose: () => void;
  onConfirm: (date: Date) => void;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function Field({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}. Tap to change`}
      className="min-w-0 flex-1 rounded-2xl border border-overlay-border bg-overlay-surface-raised px-4 py-3 active:opacity-80"
    >
      <Text className="text-[11px] text-overlay-ink-muted">{label}</Text>
      <Text numberOfLines={1} className="text-sm font-medium text-overlay-ink">
        {value}
      </Text>
    </Pressable>
  );
}

export function SchedulePostModal({ onClose, onConfirm }: SchedulePostModalProps) {
  const [value, setValue] = useState<Date>(() => defaultSchedule());
  const valid = isFarEnough(value);

  function setDatePart(picked: Date) {
    const next = new Date(value);
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    setValue(next);
  }

  function setTimePart(picked: Date) {
    const next = new Date(value);
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    setValue(next);
  }

  function openAndroid(mode: "date" | "time") {
    DateTimePickerAndroid.open({
      value,
      mode,
      minimumDate: mode === "date" ? startOfToday() : undefined,
      onChange: (e, picked) => {
        if (e.type !== "set" || !picked) return;
        if (mode === "date") setDatePart(picked);
        else setTimePart(picked);
      },
    });
  }

  return (
    <Modal onClose={onClose} ariaLabel="Schedule post" maxWidth={380}>
      <Text className="mb-4 font-display text-lg text-overlay-ink">Schedule post</Text>

      {Platform.OS === "ios" ? (
        <View className="flex-row items-center justify-between rounded-2xl border border-overlay-border bg-overlay-surface-raised px-3 py-2">
          <DateTimePicker
            value={value}
            mode="date"
            display="compact"
            themeVariant="dark"
            minimumDate={startOfToday()}
            onChange={(_e: DateTimePickerEvent, d?: Date) => d && setDatePart(d)}
          />
          <DateTimePicker value={value} mode="time" display="compact" themeVariant="dark" onChange={(_e: DateTimePickerEvent, d?: Date) => d && setTimePart(d)} />
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Field label="Date" value={formatDate(value)} onPress={() => openAndroid("date")} />
          <Field label="Time" value={formatTime(value)} onPress={() => openAndroid("time")} />
        </View>
      )}

      <Text accessibilityLiveRegion="polite" className={`mt-3 text-sm ${valid ? "text-overlay-ink-muted" : "text-overlay-danger"}`}>
        {valid ? `Posts ${formatScheduleShort(value)}` : `Choose a time at least ${Math.round(MIN_SCHEDULE_LEAD_MS / 60000)} minutes from now.`}
      </Text>

      <View className="mt-5 flex-row items-center gap-2">
        <Pressable onPress={onClose} accessibilityRole="button" className="flex-1 items-center rounded-full bg-overlay-surface-raised py-2.5">
          <Text className="text-sm font-medium text-overlay-ink">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => isFarEnough(value) && onConfirm(value)}
          disabled={!valid}
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid }}
          className={`flex-1 items-center rounded-full bg-overlay-accent py-2.5 ${valid ? "" : "opacity-50"}`}
        >
          <Text className="text-sm font-medium text-overlay-surface">Schedule</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
