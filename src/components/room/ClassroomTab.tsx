// src/components/room/ClassroomTab.tsx
// The cohort's lecture feed: hosts post text or hold-to-record voice lectures and run polls;
// members read, listen and vote.
import { BarChart3, Mic, Send, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VoiceMessageBubble } from "@/components/messages/VoiceMessageBubble";
import { RoomMedia } from "@/components/room/RoomMedia";
import { VoiceComposerOverlay } from "@/components/room/VoiceComposerOverlay";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useMicGesture } from "@/hooks/useMicGesture";
import { useCreateRoomPoll, usePostToRoom, usePostVoiceNoteToRoom, useRoomMembersList, useRoomPolls, useRoomPosts, useVoteOnPoll } from "@/hooks/useRoom";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { haptics } from "@/lib/haptics";
import { decodeVoiceNote } from "@/lib/voiceNotes";
import { useTheme } from "@/theme/ThemeProvider";

const inputStyle = { fontFamily: "Inter_400Regular" } as const;

function PollComposer({ onCreate, onCancel, pending }: { onCreate: (q: string, opts: string[], multi: boolean) => void; onCancel: () => void; pending: boolean }) {
  const { colors } = useTheme();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canPost = !pending && !!question.trim() && filled.length >= 2;

  return (
    <View className="mb-3 rounded-xl border border-border bg-surface p-3">
      <TextInput
        value={question}
        onChangeText={setQuestion}
        placeholder="Ask a question…"
        placeholderTextColor={colors.inkMuted}
        className="mb-2 rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink"
        style={inputStyle}
        accessibilityLabel="Poll question"
      />
      {options.map((opt, i) => (
        <View key={i} className="mb-1.5 flex-row items-center gap-1.5">
          <TextInput
            value={opt}
            onChangeText={(text) => setOptions((prev) => prev.map((o, oi) => (oi === i ? text : o)))}
            placeholder={`Option ${i + 1}`}
            placeholderTextColor={colors.inkMuted}
            className="flex-1 rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm text-ink"
            style={inputStyle}
            accessibilityLabel={`Option ${i + 1}`}
          />
          {options.length > 2 && (
            <Pressable onPress={() => setOptions((prev) => prev.filter((_, oi) => oi !== i))} accessibilityLabel="Remove option" hitSlop={8}>
              <Icon as={X} size={14} className="text-ink-muted" />
            </Pressable>
          )}
        </View>
      ))}
      <Pressable onPress={() => setOptions((prev) => [...prev, ""])} accessibilityRole="button" className="mb-2 self-start">
        <Text className="text-xs font-medium text-accent">+ Add option</Text>
      </Pressable>
      <View className="mb-2">
        <Checkbox checked={allowMultiple} onChange={setAllowMultiple} label="Allow multiple choices" />
      </View>
      <View className="flex-row items-center gap-3">
        <Pressable onPress={() => canPost && onCreate(question.trim(), filled, allowMultiple)} disabled={!canPost} accessibilityRole="button" className={`rounded-full bg-accent px-4 py-2 ${canPost ? "" : "opacity-50"}`}>
          <Text className="text-sm font-medium text-canvas">{pending ? "Posting…" : "Post poll"}</Text>
        </Pressable>
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
          <Text className="text-sm text-ink-muted">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

type Poll = NonNullable<ReturnType<typeof useRoomPolls>["data"]>[number];

function PollCard({ projectId, poll }: { projectId: string; poll: Poll }) {
  const vote = useVoteOnPoll(projectId);
  const toast = useToast();
  const totalVotes = Object.values(poll.voteCounts).reduce((a, b) => a + b, 0);

  return (
    <View className="rounded-xl border border-border bg-surface p-3">
      <View className="mb-2 flex-row items-center gap-1.5">
        <Icon as={BarChart3} size={13} className="text-ink-muted" />
        <Text className="min-w-0 flex-1 text-sm font-medium text-ink">{poll.question}</Text>
      </View>
      <View className="gap-1.5">
        {poll.options.map((opt) => {
          const count = poll.voteCounts[opt.id] ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const mine = poll.myOptionIds.includes(opt.id);
          return (
            <Pressable
              key={opt.id}
              onPress={() => {
                haptics.selection();
                vote.mutate(
                  { pollId: poll.id, optionId: opt.id, allowMultiple: poll.allow_multiple, currentVoteIds: poll.myOptionIds },
                  { onError: () => toast("Couldn't record your vote.", { variant: "error" }) }
                );
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: mine }}
              className={`overflow-hidden rounded-lg border px-3 py-2 ${mine ? "border-accent" : "border-border"}`}
            >
              <View className="absolute inset-y-0 left-0 bg-accent-soft/50" style={{ width: `${pct}%` }} />
              <View className="flex-row items-center justify-between gap-2">
                <Text className="min-w-0 flex-1 text-sm text-ink">{opt.label}</Text>
                <Text className="text-xs text-ink-muted">
                  {count} · {pct}%
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ClassroomTab({ projectId, isHost }: { projectId: string; isHost: boolean }) {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  const { data: posts } = useRoomPosts(projectId);
  const { data: members } = useRoomMembersList(projectId);
  const { data: polls } = useRoomPolls(projectId);
  const postToRoom = usePostToRoom(projectId);
  const postVoiceNote = usePostVoiceNoteToRoom(projectId);
  const createPoll = useCreateRoomPoll(projectId);
  const [draft, setDraft] = useState("");
  const [showPollComposer, setShowPollComposer] = useState(false);
  const memberByUserId = useMemo(() => new Map((members ?? []).map((m) => [m.user_id, m.profile])), [members]);

  const voiceRecorder = useVoiceRecorder(async (file, durationSec, peaks) => {
    try {
      await postVoiceNote.mutateAsync({ file, durationSec, peaks });
    } catch {
      toast("Couldn't post the voice lecture. Please try again.", { variant: "error" });
      throw new Error("send failed");
    }
  });
  const micGesture = useMicGesture(voiceRecorder);
  const recordingActive = voiceRecorder.phase !== "idle";
  const composerSafeStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value > 0 ? 0 : insets.bottom }));

  async function handlePost() {
    const text = draft.trim();
    if (!text) return;
    try {
      await postToRoom.mutateAsync({ type: "text", content: text });
      setDraft("");
      haptics.light();
    } catch {
      toast("Couldn't post that.", { variant: "error" });
    }
  }

  const postList = posts ?? [];
  const pollList = polls ?? [];

  return (
    <View className="flex-1">
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        {isHost && (
          <Pressable onPress={() => setShowPollComposer((s) => !s)} accessibilityRole="button" className="mb-3 flex-row items-center gap-1 self-start">
            <Icon as={BarChart3} size={13} className="text-accent" />
            <Text className="text-xs font-medium text-accent">New poll</Text>
          </Pressable>
        )}
        {showPollComposer && (
          <PollComposer
            pending={createPoll.isPending}
            onCancel={() => setShowPollComposer(false)}
            onCreate={(q, opts, multi) =>
              createPoll.mutate(
                { question: q, options: opts, allowMultiple: multi },
                { onSuccess: () => setShowPollComposer(false), onError: () => toast("Couldn't post the poll.", { variant: "error" }) }
              )
            }
          />
        )}

        <View className="gap-2">
          {pollList.map((poll) => (
            <PollCard key={poll.id} projectId={projectId} poll={poll} />
          ))}
          {postList.length === 0 && pollList.length === 0 && <Text className="text-xs text-ink-muted">Nothing posted yet.</Text>}
          {postList.map((p) => {
            const sender = memberByUserId.get(p.sender_id);
            const voiceNote = p.type === "voice_note" && p.content ? decodeVoiceNote(p.content) : null;
            return (
              <View key={p.id} className="rounded-xl border border-border bg-surface p-3">
                <View className="mb-1.5 flex-row items-center gap-1.5">
                  <Avatar src={sender?.avatar_url} name={sender?.display_name ?? "Host"} size="sm" />
                  <Text className="text-xs font-medium text-ink">{sender?.display_name ?? "Host"}</Text>
                </View>
                {p.type === "text" && (
                  <Text selectable className="text-sm text-ink">
                    {p.content}
                  </Text>
                )}
                {voiceNote && <VoiceMessageBubble url={voiceNote.url} path={voiceNote.path} durationSec={voiceNote.durationSec} peaks={voiceNote.peaks} isMine={false} />}
                {p.media_url && (p.type === "video" || p.type === "image" || (p.type === "audio" && !voiceNote)) && <RoomMedia kind={p.type} url={p.media_url} />}
                <Text className="mt-1.5 text-xs text-ink-muted">{new Date(p.created_at).toLocaleString()}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {isHost && (
        <Animated.View style={composerSafeStyle} className="relative border-t border-border bg-canvas">
          <View className="flex-row items-center gap-2 px-4 py-2.5" pointerEvents={recordingActive ? "none" : "auto"} accessibilityElementsHidden={recordingActive}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Post a lecture…"
              placeholderTextColor={colors.inkMuted}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              className="min-w-0 flex-1 rounded-full border border-border bg-canvas px-4 py-2.5 text-sm text-ink"
              style={inputStyle}
              returnKeyType="send"
              onSubmitEditing={handlePost}
            />
            {draft.trim() ? (
              <Pressable onPress={handlePost} disabled={postToRoom.isPending} accessibilityRole="button" accessibilityLabel="Post" className={`shrink-0 rounded-full bg-accent p-2.5 ${postToRoom.isPending ? "opacity-50" : ""}`}>
                <Icon as={Send} size={16} className="text-white" />
              </Pressable>
            ) : (
              <GestureDetector gesture={micGesture}>
                <View accessibilityRole="button" accessibilityLabel="Hold to record a voice lecture" className="shrink-0 rounded-full bg-accent p-2.5">
                  <Icon as={Mic} size={16} className="text-white" />
                </View>
              </GestureDetector>
            )}
          </View>
          <VoiceComposerOverlay recorder={voiceRecorder} />
        </Animated.View>
      )}
    </View>
  );
}
