// src/components/post/StanceComposer.tsx
// The Support / Disagree / Pushback composer. Opens as a card docked to the
// bottom; the coloured top border and submit button follow the active stance.
// With only one stance on offer (an author supporting their own post) the tabs
// are hidden.
import { useRef, useState } from "react";
import { Pressable, View, type TextInput } from "react-native";

import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Text } from "@/components/ui/Text";
import { useCreateComment } from "@/hooks/useComments";
import { CONTENT_LIMIT, contentCounterClass } from "@/lib/textLimits";
import type { Stance } from "@/types/database";
import { MentionTextarea } from "./MentionTextarea";

const STANCES: Stance[] = ["support", "disagree", "pushback"];

// Every class string is spelled out in full so Tailwind can see it at build time.
export const STANCE_COLORS: Record<
  Stance,
  {
    label: string;
    prompt: string;
    iconClass: string; // text-* for tray icon stroke
    tabActive: string; // active tab background + underline
    tabTextActive: string; // active tab label colour
    topBorderClass: string; // coloured top border on the card
    submitClass: string; // submit button background
    pillClass: string; // comment pill background (see CommentThread)
    pillTextClass: string; // comment pill label colour
  }
> = {
  support: {
    label: "Support",
    prompt: "Add your reasoning or build on the argument.",
    iconClass: "text-ink",
    tabActive: "border-b-2 border-accent bg-accent-soft",
    tabTextActive: "text-accent",
    topBorderClass: "border-t-4 border-accent",
    submitClass: "bg-accent",
    pillClass: "bg-accent-soft",
    pillTextClass: "text-accent",
  },
  disagree: {
    label: "Disagree",
    prompt: "Explain your position.",
    iconClass: "text-ink",
    tabActive: "border-b-2 border-danger bg-danger/10",
    tabTextActive: "text-danger",
    topBorderClass: "border-t-4 border-danger",
    submitClass: "bg-danger",
    pillClass: "bg-danger/10",
    pillTextClass: "text-danger",
  },
  pushback: {
    label: "Pushback",
    prompt: "What would you question, qualify, or add?",
    iconClass: "text-ink",
    tabActive: "border-b-2 border-pushback bg-pushback/10",
    tabTextActive: "text-pushback",
    topBorderClass: "border-t-4 border-pushback",
    submitClass: "bg-pushback",
    pillClass: "bg-pushback/10",
    pillTextClass: "text-pushback",
  },
};

interface StanceComposerProps {
  postId: string;
  stance: Stance;
  onClose: () => void;
  /** Present = this stance is a reply to that comment. */
  parentCommentId?: string;
  /** Which stances to offer as tabs. Defaults to all three. */
  stances?: Stance[];
}

export function StanceComposer({ postId, stance: initialStance, onClose, parentCommentId, stances = STANCES }: StanceComposerProps) {
  const [activeStance, setActiveStance] = useState<Stance>(initialStance);
  const [content, setContent] = useState("");
  const inputRef = useRef<TextInput>(null);
  const [error, setError] = useState<string | null>(null);
  const createComment = useCreateComment(postId);
  const toast = useToast();

  const colors = STANCE_COLORS[activeStance];

  function switchStance(s: Stance) {
    setActiveStance(s);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleSubmit() {
    if (!content.trim()) return;
    setError(null);
    try {
      await createComment.mutateAsync({
        post_id: postId,
        content,
        stance: activeStance,
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
    <Modal onClose={onClose} bare align="bottom" maxWidth={448} ariaLabel={`${colors.label} composer`}>
      <View className={`overflow-hidden rounded-2xl bg-canvas ${colors.topBorderClass}`}>
        {stances.length > 1 ? (
          <View className="flex-row border-b border-border">
            {stances.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeStance === s }}
                onPress={() => switchStance(s)}
                className={`flex-1 items-center py-3 ${activeStance === s ? STANCE_COLORS[s].tabActive : ""}`}
              >
                <Text className={`text-sm font-medium ${activeStance === s ? STANCE_COLORS[s].tabTextActive : "text-ink-muted"}`}>
                  {STANCE_COLORS[s].label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View className="p-5">
          <Text className="mb-3 text-sm text-ink-muted">{colors.prompt}</Text>

          <MentionTextarea
            ref={inputRef}
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
              <Text className="text-sm font-medium text-canvas">{createComment.isPending ? "Posting…" : colors.label}</Text>
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
