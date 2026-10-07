// src/components/project-types/MeetingFields.tsx
import { Video } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { DateTimeFormField } from "@/components/ui/DateTimeFormField";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";

export interface MeetingFieldsValue {
  scheduled_at: string; // "YYYY-MM-DDTHH:mm" local, required
  recording_enabled: boolean;
}

export const EMPTY_MEETING_FIELDS: MeetingFieldsValue = { scheduled_at: "", recording_enabled: false };

export function MeetingFields({ value, onChange, error }: { value: MeetingFieldsValue; onChange: (value: MeetingFieldsValue) => void; error?: string }) {
  return (
    <>
      <DateTimeFormField label="When does it happen?" value={value.scheduled_at} onChange={(scheduled_at) => onChange({ ...value, scheduled_at })} error={error} />

      <Pressable
        onPress={() => onChange({ ...value, recording_enabled: !value.recording_enabled })}
        accessibilityRole="switch"
        accessibilityState={{ checked: value.recording_enabled }}
        className={`mb-4 w-full flex-row items-center gap-2.5 rounded-xl border px-4 py-3 ${value.recording_enabled ? "border-accent bg-accent-soft/60" : "border-border bg-surface"}`}
      >
        <Icon as={Video} size={16} className={value.recording_enabled ? "text-accent" : "text-ink-muted"} />
        <View className="flex-1">
          <Text className="font-medium text-ink">Record this meeting</Text>
          <Text className="text-xs text-ink-muted">Everyone sees a recording notice before joining. The finished recording is shared here afterward.</Text>
        </View>
      </Pressable>
    </>
  );
}
