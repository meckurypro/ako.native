// src/components/comments/CommentReportSheet.tsx
import { Flag } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import type { CommentWithAuthor } from "@/hooks/useComments";
import { useReportReasons, useSubmitReport } from "@/hooks/useReports";
import { useTheme } from "@/theme/ThemeProvider";

export function CommentReportSheet({ comment, onClose }: { comment: CommentWithAuthor; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { data: reasons, isLoading: reasonsLoading } = useReportReasons();
  const submitReport = useSubmitReport();
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [details, setDetails] = useState("");

  async function handleSubmit() {
    if (!reasonId) return;
    try {
      await submitReport.mutateAsync({ targetType: "comment", targetId: comment.id, reasonId, details });
      toast("Report submitted. Thanks for flagging this.", { variant: "success" });
      onClose();
    } catch {
      toast("Couldn't submit your report. Try again.", { variant: "error" });
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Report comment" maxWidth={448}>
      <View className="mb-4 flex-row items-center gap-2">
        <Icon as={Flag} size={18} className="text-overlay-danger" />
        <Text className="font-display text-lg text-overlay-ink">Report comment</Text>
      </View>

      <Text numberOfLines={2} className="mb-3 text-sm text-overlay-ink-muted">
        {`Reporting ${comment.author.display_name}'s comment: "${comment.content}"`}
      </Text>

      {reasonsLoading ? <Text className="py-4 text-center text-sm text-overlay-ink-muted">Loading reasons…</Text> : null}

      <View className="mb-3 gap-1.5">
        {reasons?.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => setReasonId(r.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: reasonId === r.id }}
            className={`rounded-xl border px-3.5 py-2.5 ${reasonId === r.id ? "border-overlay-accent bg-overlay-accent-soft" : "border-overlay-border bg-overlay-surface-raised"}`}
          >
            <Text className="text-sm font-medium text-overlay-ink">{r.label}</Text>
            {r.description ? <Text className="mt-0.5 text-xs text-overlay-ink-muted">{r.description}</Text> : null}
          </Pressable>
        ))}
      </View>

      <TextInput
        value={details}
        onChangeText={setDetails}
        placeholder="Add details (optional, required for 'Other')"
        placeholderTextColor="#98989D"
        multiline
        textAlignVertical="top"
        selectionColor={colors.accent}
        className="mb-3 rounded-xl border border-overlay-border bg-overlay-surface-raised px-3.5 py-2.5 text-sm text-overlay-ink"
        style={{ fontFamily: "Inter_400Regular", minHeight: 76 }}
      />

      <Pressable
        onPress={() => void handleSubmit()}
        disabled={!reasonId || submitReport.isPending}
        accessibilityRole="button"
        className={`flex-row items-center justify-center gap-2 rounded-xl bg-overlay-danger py-2.5 ${!reasonId || submitReport.isPending ? "opacity-50" : ""}`}
      >
        {submitReport.isPending ? <ActivityIndicator size="small" color="#1C1C1E" /> : null}
        <Text className="text-sm font-medium text-overlay-surface">Submit report</Text>
      </Pressable>
    </Modal>
  );
}
