// src/components/room/MeetingsTab.tsx
// Scheduled cohort meetings: hosts schedule (optionally recorded); everyone sees countdowns and,
// once a meeting is live, a Join button.
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RoomCallView } from "@/components/room/RoomCallView";
import { Checkbox } from "@/components/ui/Checkbox";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { formatCountdown, useCountdown } from "@/hooks/useCountdown";
import { useRoomMeetings, useScheduleRoomMeeting, type RoomMeeting } from "@/hooks/useRoom";
import { haptics } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

function MeetingRow({ meeting, onJoin }: { meeting: RoomMeeting; onJoin: () => void }) {
  const remainingMs = useCountdown(meeting.scheduled_at) ?? new Date(meeting.scheduled_at).getTime() - Date.now();
  const isLive = remainingMs <= 0 && meeting.status !== "ended" && meeting.status !== "cancelled";
  return (
    <View className="rounded-xl border border-border bg-surface p-3">
      <Text className="text-sm font-medium text-ink">{meeting.title || "Cohort meeting"}</Text>
      <Text className="text-xs text-ink-muted">{new Date(meeting.scheduled_at).toLocaleString()}</Text>
      {meeting.status === "ended" ? (
        <Text className="mt-1 text-xs text-ink-muted">Ended{meeting.recording_url ? " — recording posted to Classroom" : ""}</Text>
      ) : meeting.status === "cancelled" ? (
        <Text className="mt-1 text-xs text-danger">Cancelled</Text>
      ) : isLive ? (
        <Pressable onPress={onJoin} accessibilityRole="button" className="mt-1.5 self-start rounded-full bg-accent px-3 py-1.5">
          <Text className="text-xs font-medium text-canvas">Join now</Text>
        </Pressable>
      ) : (
        <Text className="mt-1 text-xs font-medium text-accent">Starts in {formatCountdown(remainingMs)}</Text>
      )}
    </View>
  );
}

export function MeetingsTab({ projectId, isHost }: { projectId: string; isHost: boolean }) {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { data: meetings } = useRoomMeetings(projectId);
  const scheduleMeeting = useScheduleRoomMeeting(projectId);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<Date | null>(null);
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [activeCallMeetingId, setActiveCallMeetingId] = useState<string | null>(null);

  async function handleSchedule() {
    if (!when) return;
    try {
      // toISOString() carries the timezone; the web sent the bare datetime-local string, which the
      // server then read as UTC.
      await scheduleMeeting.mutateAsync({ title: title.trim() || undefined, scheduled_at: when.toISOString(), recording_enabled: recordingEnabled });
      setTitle("");
      setWhen(null);
      setRecordingEnabled(false);
      setShowScheduler(false);
      haptics.success();
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "Couldn't schedule the meeting.", { variant: "error" });
    }
  }

  const list = meetings ?? [];
  const activeCall = list.find((m) => m.id === activeCallMeetingId);

  return (
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
      {activeCall ? (
        <RoomCallView roomMeeting={activeCall} isHost={isHost} onLeave={() => setActiveCallMeetingId(null)} />
      ) : (
        <>
          {isHost && (
            <View className="mb-2 items-end">
              <Pressable onPress={() => setShowScheduler((s) => !s)} accessibilityRole="button" hitSlop={8}>
                <Text className="text-xs font-medium text-accent">Schedule</Text>
              </Pressable>
            </View>
          )}

          {showScheduler && (
            <View className="mb-3 gap-2 rounded-xl border border-border bg-surface p-3">
              <TextInput
                placeholder="Title (optional)"
                placeholderTextColor={colors.inkMuted}
                value={title}
                onChangeText={setTitle}
                className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink"
                style={{ fontFamily: "Inter_400Regular" }}
                accessibilityLabel="Meeting title"
              />
              <DateTimeField value={when} onChange={setWhen} minimumDate={new Date()} placeholder="Pick a date and time" />
              <Checkbox checked={recordingEnabled} onChange={setRecordingEnabled} label="Record this meeting" />
              <Pressable
                onPress={handleSchedule}
                disabled={scheduleMeeting.isPending || !when}
                accessibilityRole="button"
                className={`items-center rounded-lg bg-accent py-2 ${scheduleMeeting.isPending || !when ? "opacity-50" : ""}`}
              >
                <Text className="text-sm font-medium text-canvas">{scheduleMeeting.isPending ? "Scheduling…" : "Schedule meeting"}</Text>
              </Pressable>
            </View>
          )}

          {list.length === 0 ? (
            <Text className="text-xs text-ink-muted">No meetings scheduled yet.</Text>
          ) : (
            <View className="gap-2">
              {list.map((m) => (
                <MeetingRow key={m.id} meeting={m} onJoin={() => setActiveCallMeetingId(m.id)} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
