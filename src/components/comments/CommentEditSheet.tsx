// src/components/comments/CommentEditSheet.tsx
import { Pencil } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useUpdateComment, type CommentWithAuthor } from "@/hooks/useComments";
import { useTheme } from "@/theme/ThemeProvider";

const COMMENT_LIMIT = 2000; // matches create-comment / update-comment

export function CommentEditSheet({ comment, onClose }: { comment: CommentWithAuthor; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const update = useUpdateComment(comment.post_id);
  const [text, setText] = useState(comment.content);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= COMMENT_LIMIT && trimmed !== comment.content.trim();

  async function handleSave() {
    if (!canSave) return;
    setError(null);
    try {
      await update.mutateAsync({ comment_id: comment.id, content: trimmed });
      toast("Comment updated.", { variant: "success" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your edit.");
    }
  }

  const disabled = !canSave || update.isPending;

  return (
    <Modal onClose={onClose} ariaLabel="Edit comment" maxWidth={448}>
      <View className="mb-4 flex-row items-center gap-2">
        <Icon as={Pencil} size={18} className="text-overlay-ink" />
        <Text className="font-display text-lg text-overlay-ink">Edit comment</Text>
      </View>

      <TextInput
        value={text}
        onChangeText={setText}
        maxLength={COMMENT_LIMIT}
        multiline
        autoFocus
        textAlignVertical="top"
        selectionColor={colors.accent}
        className="mb-2 rounded-xl border border-overlay-border bg-overlay-surface-raised px-3.5 py-2.5 text-sm text-overlay-ink"
        style={{ fontFamily: "Inter_400Regular", minHeight: 120 }}
      />

      <Text className="mb-3 text-xs text-overlay-ink-muted">You can edit until someone likes, replies to, or gifts this comment.</Text>

      {error ? <Text className="mb-3 text-sm text-overlay-danger">{error}</Text> : null}

      <Pressable
        onPress={() => void handleSave()}
        disabled={disabled}
        accessibilityRole="button"
        className={`flex-row items-center justify-center gap-2 rounded-xl bg-overlay-accent py-2.5 ${disabled ? "opacity-50" : ""}`}
      >
        {update.isPending ? <ActivityIndicator size="small" color="#1C1C1E" /> : null}
        <Text className="text-sm font-medium text-overlay-surface">Save</Text>
      </Pressable>
    </Modal>
  );
}
