// src/components/post/StanceComposer.tsx
// The Support / Question / Pushback / Comment composer. Opens as a card docked to the
// bottom; the coloured top border and submit button follow the stance. The stance is
// fixed once the composer is open (shown as a chip, not switchable): to change it,
// close and pick another. Comment is the neutral one and carries no colour.
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Text } from "@/components/ui/Text";
import { useCreateComment } from "@/hooks/useComments";
import { CONTENT_LIMIT, contentCounterClass } from "@/lib/textLimits";
import type { Stance } from "@/types/database";
import { MentionTextarea } from "./MentionTextarea";

// Every class string is spelled out in full so Tailwind can see it at build time.
export const STANCE_COLORS: Record<
  Stance,
  {
    label: string;
    submitLabel: string; // what the post button says
    prompt: string;
    iconClass: string; // text-* for tray icon stroke
    chipClass: string; // the fixed stance chip's background
    chipTextClass: string; // …and its label colour
    topBorderClass: string; // coloured top border on the card
    submitClass: string; // submit button background
    submitTextClass: string;
    pillClass: string; // comment pill background (see CommentThread)
    pillTextClass: string; // comment pill label colour
  }
> = {
  support: {
    label: "Add",
    submitLabel: "Add",
    prompt: "Build on it, agree, or share what you know.",
    iconClass: "text-ink",
    chipClass: "bg-accent-soft",
    chipTextClass: "text-accent",
    topBorderClass: "border-t-4 border-accent",
    submitClass: "bg-accent",
    submitTextClass: "text-canvas",
    pillClass: "bg-accent-soft",
    pillTextClass: "text-accent",
  },
  question: {
    label: "Question",
    submitLabel: "Ask",
    prompt: "What would you like to know?",
    iconClass: "text-ink",
    chipClass: "bg-stance-question-a10",
    chipTextClass: "text-stance-question",
    topBorderClass: "border-t-4 border-stance-question",
    submitClass: "bg-stance-question",
    submitTextClass: "text-canvas",
    pillClass: "bg-stance-question-a10",
    pillTextClass: "text-stance-question",
  },
  pushback: {
    label: "Pushback",
    submitLabel: "Push back",
    prompt: "Say where you disagree, or what you'd question or qualify.",
    iconClass: "text-ink",
    chipClass: "bg-pushback-a10",
    chipTextClass: "text-pushback",
    topBorderClass: "border-t-4 border-pushback",
    submitClass: "bg-pushback",
    submitTextClass: "text-canvas",
    pillClass: "bg-pushback-a10",
    pillTextClass: "text-pushback",
  },
  comment: {
    label: "Comment",
    submitLabel: "Comment",
    prompt: "Say something.",
    iconClass: "text-ink",
    chipClass: "bg-surface",
    chipTextClass: "text-ink-muted",
    topBorderClass: "border-t-4 border-border",
    submitClass: "bg-ink",
    submitTextClass: "text-canvas",
    pillClass: "bg-surface",
    pillTextClass: "text-ink-muted",
  },
};

interface StanceComposerProps {
  postId: string;
  /** The stance this comment is posted with. Fixed for the life of the composer. */
  stance: Stance;
  onClose: () => void;
  /** Present = this stance is a reply to that comment. */
  parentCommentId?: string;
}

export function StanceComposer({ postId, stance, onClose, parentCommentId }: StanceComposerProps) {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createComment = useCreateComment(postId);
  const toast = useToast();

  const colors = STANCE_COLORS[stance];

  async function handleSubmit() {
    if (!content.trim()) return;
    setError(null);
    try {
      await createComment.mutateAsync({
        post_id: postId,
        content,
        stance,
        parent_comment_id: parentCommentId,
      });
      setContent("");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't post this.";
      setError(message);
      toast(message, { variant: "error" });
    }
  }

  return (
    <Modal onClose={onClose} bare align="bottom" scrim="canvas" maxWidth={448} ariaLabel={`${colors.label} composer`}>
      <View className={`overflow-hidden rounded-2xl bg-canvas ${colors.topBorderClass}`}>
        <View className="p-5">
          {/* The stance is fixed once the composer is open: shown, not switchable. */}
          <View className={`mb-3 self-start rounded-full px-3 py-1 ${colors.chipClass}`}>
            <Text className={`text-xs font-semibold ${colors.chipTextClass}`}>{colors.label}</Text>
          </View>

          <MentionTextarea
            value={content}
            onChange={setContent}
            maxLength={CONTENT_LIMIT}
            rows={4}
            autoFocus
            showFormatToolbar
            placeholder={colors.prompt}
            className="rounded-xl border border-border bg-surface px-4 py-3"
          />

          {error ? <Text className="mt-2 text-sm text-danger">{error}</Text> : null}

          <View className="mt-3 flex-row items-center justify-between">
            <Text className={`text-xs ${contentCounterClass(content.length)}`}>
              {content.length}/{CONTENT_LIMIT}
            </Text>
            <Pressable
              onPress={handleSubmit}
              disabled={!content.trim() || createComment.isPending}
              accessibilityRole="button"
              className={`rounded-full px-5 py-2 ${colors.submitClass} ${!content.trim() || createComment.isPending ? "opacity-50" : ""}`}
            >
              <Text className={`text-sm font-medium ${colors.submitTextClass}`}>{createComment.isPending ? "Posting…" : colors.submitLabel}</Text>
            </Pressable>
          </View>

          <View className="mt-3 items-center">
            <Pressable onPress={onClose} accessibilityRole="button" className="rounded-full border border-border px-6 py-2 active:bg-surface">
              <Text className="text-sm font-medium text-ink-muted">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
