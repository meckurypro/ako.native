// src/components/project-types/RoomFields.tsx
//
// The "what kind of group is this?" part of the group form. A group is a community (open-ended, social) or a
// cohort (structured learning with dates). The kind is fixed once it's created, so this is the one place it's chosen.
import { Pressable, View } from "react-native";

import { DateTimeFormField } from "@/components/ui/DateTimeFormField";
import { InfoNote } from "@/components/ui/InfoNote";
import { Text } from "@/components/ui/Text";
import type { GroupJoinMode } from "@/hooks/useRoom";
import { GROUP_KIND_BLURB, GROUP_KIND_LABEL, type GroupKind } from "@/lib/groups";

export interface RoomFieldsValue {
  kind: GroupKind;
  join_mode: GroupJoinMode; // communities only; a cohort always has a host review requests
  start_date: string; // "YYYY-MM-DDTHH:mm" local, cohorts only, optional
  end_date: string;
}

export const EMPTY_ROOM_FIELDS: RoomFieldsValue = { kind: "community", join_mode: "open", start_date: "", end_date: "" };

const KINDS: GroupKind[] = ["community", "cohort"];

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-1 rounded-xl border px-3 py-3 ${selected ? "border-accent bg-accent-soft-a60" : "border-border bg-surface"}`}
    >
      <Text className={`text-sm font-medium ${selected ? "text-ink" : "text-ink-muted"}`}>{label}</Text>
    </Pressable>
  );
}

export function RoomFields({
  value,
  onChange,
  error,
  lockKind,
}: {
  value: RoomFieldsValue;
  onChange: (value: RoomFieldsValue) => void;
  error?: string;
  /** Editing an existing group: its kind is fixed, so it's shown but not changeable. */
  lockKind?: boolean;
}) {
  return (
    <>
      {lockKind ? (
        <Text className="mb-1 text-sm text-ink">
          Type: <Text className="font-medium text-ink">{GROUP_KIND_LABEL[value.kind]}</Text>
          <Text className="text-ink-muted"> — fixed once a group is created.</Text>
        </Text>
      ) : (
        <View className="mb-2 flex-row gap-2" accessibilityRole="radiogroup">
          {KINDS.map((kind) => (
            <Choice
              key={kind}
              label={GROUP_KIND_LABEL[kind]}
              selected={value.kind === kind}
              onPress={() =>
                onChange({
                  ...value,
                  kind,
                  // A cohort is always approval-based and the only kind with dates.
                  join_mode: kind === "cohort" ? "request" : value.join_mode,
                  start_date: kind === "cohort" ? value.start_date : "",
                  end_date: kind === "cohort" ? value.end_date : "",
                })
              }
            />
          ))}
        </View>
      )}
      <Text className="mb-4 text-xs text-ink-muted">{GROUP_KIND_BLURB[value.kind]}</Text>

      {value.kind === "community" ? (
        <View className="mb-4">
          <Text className="mb-2 text-sm font-medium text-ink">Who can join?</Text>
          <View className="flex-row gap-2" accessibilityRole="radiogroup">
            <Choice label="Anyone" selected={value.join_mode === "open"} onPress={() => onChange({ ...value, join_mode: "open" })} />
            <Choice label="People I approve" selected={value.join_mode === "request"} onPress={() => onChange({ ...value, join_mode: "request" })} />
          </View>
          <Text className="mt-2 text-xs text-ink-muted">Setting a price or making it private overrides this: paid groups are joined by purchase, private groups by invitation.</Text>
        </View>
      ) : (
        <>
          <DateTimeFormField label="Start date (optional)" value={value.start_date} onChange={(start_date) => onChange({ ...value, start_date })} clearable />
          <DateTimeFormField label="End date (optional)" value={value.end_date} onChange={(end_date) => onChange({ ...value, end_date })} error={error} clearable />
          <InfoNote>
            Members see a countdown once a start date is set. After the end date, the cohort closes — only media you've posted stays visible to people who were in it. You'll set up lectures,
            meetings, and assignments after creating it.
          </InfoNote>
        </>
      )}
    </>
  );
}
