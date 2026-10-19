// src/components/post/SchedulePostModal.tsx
// "Schedule this post" — built so nobody has to guess how it works:
//   1. Quick picks (In 1 hour / Today / Tomorrow / Monday) — one tap for the common cases.
//   2. A pre-filled default, so the primary button is never a dead end.
//   3. Date and Time as two clearly labelled, icon-and-chevron fields (they look tappable because they are).
//   4. A live summary ("Posts Tue, Oct 20 at 9:00 AM · in 13 hours") and inline validation instead of a
//      silently disabled button.
// Android opens the system date dialog, then the time dialog; iOS shows compact native pickers.
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { CalendarDays, ChevronRight, Clock, Info } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import {
  buildPresets,
  defaultSchedule,
  formatDate,
  formatScheduleShort,
  formatTime,
  isFarEnough,
  localTimeZone,
  MIN_SCHEDULE_LEAD_MS,
  relativeFromNow,
} from "@/lib/schedulePresets";

interface SchedulePostModalProps {
  onClose: () => void;
  onConfirm: (date: Date) => void;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function SchedulePostModal({ onClose, onConfirm }: SchedulePostModalProps) {
  const [value, setValue] = useState<Date>(() => defaultSchedule());
  const presets = useMemo(() => buildPresets(), []);
  const timeZone = useMemo(() => localTimeZone(), []);

  const valid = isFarEnough(value);
  const minutes = Math.round(MIN_SCHEDULE_LEAD_MS / 60000);

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

  function openAndroidDate() {
    DateTimePickerAndroid.open({
      value,
      mode: "date",
      minimumDate: startOfToday(),
      onChange: (e, picked) => {
        if (e.type === "set" && picked) setDatePart(picked);
      },
    });
  }

  function openAndroidTime() {
    DateTimePickerAndroid.open({
      value,
      mode: "time",
      onChange: (e, picked) => {
        if (e.type === "set" && picked) setTimePart(picked);
      },
    });
  }

  return (
    <Modal onClose={onClose} ariaLabel="Schedule post" maxWidth={420}>
      <Text className="mb-1 font-display text-lg text-overlay-ink">Schedule this post</Text>
      <Text className="mb-4 text-sm text-overlay-ink-muted">Choose when it should go live. It posts automatically.</Text>

      {presets.length > 0 ? (
        <View className="mb-4 flex-row flex-wrap gap-2">
          {presets.map((p) => {
            const selected = p.date.getTime() === value.getTime();
            return (
              <Pressable
                key={p.key}
                onPress={() => setValue(p.date)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.label}, ${p.sub}`}
                className={`min-w-[47%] flex-1 rounded-2xl border px-3 py-2.5 ${selected ? "border-overlay-accent bg-overlay-accent-soft" : "border-overlay-border bg-overlay-surface-raised"}`}
              >
                <Text className={`text-sm font-medium ${selected ? "text-overlay-accent" : "text-overlay-ink"}`}>{p.label}</Text>
                <Text className="text-xs text-overlay-ink-muted">{p.sub}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-overlay-ink-muted">Or pick a date and time</Text>

      {Platform.OS === "ios" ? (
        <View className="flex-row items-center gap-3 rounded-2xl border border-overlay-border bg-overlay-surface-raised px-3 py-2">
          <Icon as={CalendarDays} size={18} className="text-overlay-ink-muted" />
          <DateTimePicker
            value={value}
            mode="date"
            display="compact"
            themeVariant="dark"
            minimumDate={startOfToday()}
            onChange={(_e: DateTimePickerEvent, d?: Date) => d && setDatePart(d)}
          />
          <View className="flex-1" />
          <Icon as={Clock} size={18} className="text-overlay-ink-muted" />
          <DateTimePicker
            value={value}
            mode="time"
            display="compact"
            themeVariant="dark"
            onChange={(_e: DateTimePickerEvent, d?: Date) => d && setTimePart(d)}
          />
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Pressable
            onPress={openAndroidDate}
            accessibilityRole="button"
            accessibilityLabel={`Date, ${formatDate(value)}. Tap to change`}
            className="min-w-0 flex-[3] flex-row items-center gap-2 rounded-2xl border border-overlay-border bg-overlay-surface-raised px-3 py-3 active:opacity-80"
          >
            <Icon as={CalendarDays} size={18} className="text-overlay-accent" />
            <View className="min-w-0 flex-1">
              <Text className="text-[11px] text-overlay-ink-muted">Date</Text>
              <Text numberOfLines={1} className="text-sm font-medium text-overlay-ink">
                {formatDate(value)}
              </Text>
            </View>
            <Icon as={ChevronRight} size={16} className="text-overlay-ink-muted" />
          </Pressable>
          <Pressable
            onPress={openAndroidTime}
            accessibilityRole="button"
            accessibilityLabel={`Time, ${formatTime(value)}. Tap to change`}
            className="min-w-0 flex-[2] flex-row items-center gap-2 rounded-2xl border border-overlay-border bg-overlay-surface-raised px-3 py-3 active:opacity-80"
          >
            <Icon as={Clock} size={18} className="text-overlay-accent" />
            <View className="min-w-0 flex-1">
              <Text className="text-[11px] text-overlay-ink-muted">Time</Text>
              <Text numberOfLines={1} className="text-sm font-medium text-overlay-ink">
                {formatTime(value)}
              </Text>
            </View>
            <Icon as={ChevronRight} size={16} className="text-overlay-ink-muted" />
          </Pressable>
        </View>
      )}

      {/* Live confirmation of exactly what will happen — or why it can't yet. */}
      <View
        accessibilityLiveRegion="polite"
        className={`mt-4 flex-row items-start gap-2 rounded-2xl px-3 py-2.5 ${valid ? "bg-overlay-accent-soft" : "bg-overlay-danger-soft"}`}
      >
        <Icon as={Info} size={15} className={`mt-0.5 ${valid ? "text-overlay-accent" : "text-overlay-danger"}`} />
        {valid ? (
          <Text className="min-w-0 flex-1 text-sm text-overlay-ink">
            Posts <Text className="font-medium text-overlay-ink">{formatScheduleShort(value)}</Text> · {relativeFromNow(value)}
          </Text>
        ) : (
          <Text className="min-w-0 flex-1 text-sm text-overlay-danger">Pick a time at least {minutes} minutes from now.</Text>
        )}
      </View>
      {timeZone ? <Text className="mt-2 text-[11px] text-overlay-ink-muted">Your local time ({timeZone.replace(/_/g, " ")}). Find it later under Activity → Scheduled.</Text> : null}

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
          <Text className="text-sm font-medium text-overlay-surface">Schedule post</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
