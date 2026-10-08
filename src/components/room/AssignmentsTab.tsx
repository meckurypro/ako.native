// src/components/room/AssignmentsTab.tsx
// Assignments: hosts post them and review submissions (approve / needs revision + feedback);
// members submit text answers and see their review status.
import { CheckCircle2, XCircle } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RoomMedia } from "@/components/room/RoomMedia";
import { Avatar } from "@/components/ui/Avatar";
import { SelectField } from "@/components/ui/SelectField";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAssignments, useAssignmentSubmissions, useCreateAssignment, useMySubmission, useReviewSubmission, useSubmitAssignment } from "@/hooks/useRoom";
import { haptics } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type Format = "text" | "audio" | "video" | "image";
const FORMAT_OPTIONS = [
  { value: "text", label: "Text submission" },
  { value: "audio", label: "Audio submission" },
  { value: "video", label: "Video submission" },
  { value: "image", label: "Image submission" },
];
const inputStyle = { fontFamily: "Inter_400Regular" } as const;

function SubmissionReview({ assignmentId }: { assignmentId: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { data: submissions } = useAssignmentSubmissions(assignmentId);
  const review = useReviewSubmission(assignmentId);
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});

  if (!submissions || submissions.length === 0) return <Text className="mt-1 text-xs text-ink-muted">No submissions yet.</Text>;

  const submit = (submissionId: string, status: "approved" | "needs_revision") =>
    review.mutate({ submissionId, status, feedback: feedbackDraft[submissionId] }, { onSuccess: () => haptics.success(), onError: () => toast("Couldn't save the review.", { variant: "error" }) });

  return (
    <View className="mt-2 gap-2">
      {submissions.map((s) => (
        <View key={s.id} className="rounded-lg border border-border bg-canvas p-2.5">
          <View className="mb-1 flex-row items-center gap-1.5">
            <Avatar src={s.profile.avatar_url} name={s.profile.display_name} size="sm" />
            <Text className="text-xs font-medium text-ink">{s.profile.display_name}</Text>
            {s.status === "approved" && <Icon as={CheckCircle2} size={13} className="text-accent" />}
            {s.status === "needs_revision" && <Icon as={XCircle} size={13} className="text-danger" />}
          </View>
          {s.content ? (
            <Text selectable className="mb-1 text-sm text-ink">
              {s.content}
            </Text>
          ) : null}
          {s.media_url && s.format !== "text" && <RoomMedia kind={s.format} url={s.media_url} />}
          {s.feedback ? <Text className="mb-1 text-xs italic text-ink-muted">Feedback: {s.feedback}</Text> : null}
          {s.status === "pending" && (
            <View className="mt-1 gap-1.5">
              <TextInput
                value={feedbackDraft[s.id] ?? ""}
                onChangeText={(text) => setFeedbackDraft((prev) => ({ ...prev, [s.id]: text }))}
                placeholder="Feedback (optional)"
                placeholderTextColor={colors.inkMuted}
                multiline
                textAlignVertical="top"
                className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink"
                style={[inputStyle, { minHeight: 56 }]}
                accessibilityLabel="Feedback"
              />
              <View className="flex-row items-center gap-2">
                <Pressable onPress={() => submit(s.id, "approved")} disabled={review.isPending} accessibilityRole="button" className={`rounded-full bg-accent px-3 py-1.5 ${review.isPending ? "opacity-50" : ""}`}>
                  <Text className="text-xs font-medium text-canvas">Approve</Text>
                </Pressable>
                <Pressable onPress={() => submit(s.id, "needs_revision")} disabled={review.isPending} accessibilityRole="button" className={`rounded-full border border-border bg-surface px-3 py-1.5 ${review.isPending ? "opacity-50" : ""}`}>
                  <Text className="text-xs font-medium text-ink">Needs revision</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function AssignmentCard({ assignment, isHost }: { assignment: { id: string; title: string; required_format: Format }; isHost: boolean }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const { data: mySubmission } = useMySubmission(assignment.id);
  const submitAssignment = useSubmitAssignment(assignment.id);
  const [content, setContent] = useState("");

  async function handleSubmit() {
    const text = content.trim();
    if (!text) return;
    try {
      await submitAssignment.mutateAsync({ format: "text", content: text });
      setContent("");
      haptics.success();
    } catch {
      toast("Couldn't submit your work.", { variant: "error" });
    }
  }

  return (
    <View className="rounded-xl border border-border bg-surface p-3">
      <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded }}>
        <Text className="text-sm font-medium text-ink">{assignment.title}</Text>
        <Text className="text-xs capitalize text-ink-muted">{assignment.required_format} submission</Text>
      </Pressable>

      {expanded && isHost && <SubmissionReview assignmentId={assignment.id} />}

      {expanded && !isHost && (
        <View className="mt-2">
          {mySubmission ? (
            <View className="rounded-lg border border-border bg-canvas p-2.5">
              <Text className="mb-1 text-xs text-ink-muted">
                Submitted {new Date(mySubmission.submitted_at).toLocaleDateString()}
                {mySubmission.status === "approved" && " · Approved"}
                {mySubmission.status === "needs_revision" && " · Needs revision"}
              </Text>
              {mySubmission.content ? <Text className="text-sm text-ink">{mySubmission.content}</Text> : null}
              {mySubmission.feedback ? <Text className="mt-1 text-xs italic text-ink-muted">Feedback: {mySubmission.feedback}</Text> : null}
            </View>
          ) : assignment.required_format === "text" ? (
            <View className="gap-1.5">
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="Your submission…"
                placeholderTextColor={colors.inkMuted}
                multiline
                textAlignVertical="top"
                className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-sm text-ink"
                style={[inputStyle, { minHeight: 80 }]}
                accessibilityLabel="Your submission"
              />
              <Pressable
                onPress={handleSubmit}
                disabled={submitAssignment.isPending || !content.trim()}
                accessibilityRole="button"
                className={`self-start rounded-full bg-accent px-3 py-1.5 ${submitAssignment.isPending || !content.trim() ? "opacity-50" : ""}`}
              >
                <Text className="text-xs font-medium text-canvas">{submitAssignment.isPending ? "Submitting…" : "Submit"}</Text>
              </Pressable>
            </View>
          ) : (
            <Text className="text-xs text-ink-muted">This assignment needs a {assignment.required_format} submission — uploading that isn't wired up yet, text only for now.</Text>
          )}
        </View>
      )}
    </View>
  );
}

export function AssignmentsTab({ projectId, isHost }: { projectId: string; isHost: boolean }) {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { data: assignments } = useAssignments(projectId);
  const createAssignment = useCreateAssignment(projectId);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<Format>("text");
  const [showForm, setShowForm] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    try {
      await createAssignment.mutateAsync({ title: title.trim(), required_format: format });
      setTitle("");
      setShowForm(false);
      haptics.success();
    } catch {
      toast("Couldn't post the assignment.", { variant: "error" });
    }
  }

  const list = assignments ?? [];

  return (
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
      {isHost && (
        <View className="mb-2 items-end">
          <Pressable onPress={() => setShowForm((s) => !s)} accessibilityRole="button" hitSlop={8}>
            <Text className="text-xs font-medium text-accent">New</Text>
          </Pressable>
        </View>
      )}

      {showForm && (
        <View className="mb-3 gap-2 rounded-xl border border-border bg-surface p-3">
          <TextInput
            placeholder="Assignment title"
            placeholderTextColor={colors.inkMuted}
            value={title}
            onChangeText={setTitle}
            className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink"
            style={inputStyle}
            accessibilityLabel="Assignment title"
          />
          <SelectField label="Submission type" value={format} options={FORMAT_OPTIONS} onChange={(v) => setFormat(v as Format)} />
          <Pressable
            onPress={handleCreate}
            disabled={createAssignment.isPending || !title.trim()}
            accessibilityRole="button"
            className={`items-center rounded-lg bg-accent py-2 ${createAssignment.isPending || !title.trim() ? "opacity-50" : ""}`}
          >
            <Text className="text-sm font-medium text-canvas">{createAssignment.isPending ? "Posting…" : "Post assignment"}</Text>
          </Pressable>
        </View>
      )}

      {list.length === 0 ? (
        <Text className="text-xs text-ink-muted">No assignments yet.</Text>
      ) : (
        <View className="gap-2">
          {list.map((a) => (
            <AssignmentCard key={a.id} assignment={a} isHost={isHost} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
