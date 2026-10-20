// src/components/comments/CommentActionBar.tsx
import { Flag, Gift as GiftIcon, MessageCircle, MoreHorizontal, Pencil, Share2, ThumbsDown, Trash2 } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { AnimatedCount } from "@/components/ui/AnimatedCount";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { LikeHeart } from "@/components/ui/LikeHeart";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { canEditComment, type CommentWithAuthor } from "@/hooks/useComments";
import { useTheme } from "@/theme/ThemeProvider";
import { useCommentEngagement } from "./CommentEngagement";

/** "…" menu for one comment: share; for your own — edit (until anyone engages) and delete; for others' — gift and report. */
export function CommentMoreMenu({ comment, iconSize = 16 }: { comment: CommentWithAuthor; iconSize?: number }) {
  const eng = useCommentEngagement();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<View>(null);
  const isMine = !!eng.currentUserId && comment.author.id === eng.currentUserId;

  const items: DropdownMenuItem[] = [
    { key: "share", label: "Share", icon: <Icon as={Share2} size={22} className="text-overlay-ink" />, onSelect: () => eng.share(comment) },
    ...(isMine
      ? [
          // Editable only until anyone engages; deletable any time.
          ...(canEditComment(comment)
            ? [{ key: "edit", label: "Edit", icon: <Icon as={Pencil} size={22} className="text-overlay-ink" />, onSelect: () => eng.edit(comment) }]
            : []),
          {
            key: "delete",
            label: "Delete",
            icon: <Icon as={Trash2} size={22} className="text-overlay-danger" />,
            variant: "danger" as const,
            onSelect: () => eng.remove(comment),
          },
        ]
      : [
          { key: "gift", label: "Send a gift", icon: <Icon as={GiftIcon} size={22} className="text-overlay-ink" />, onSelect: () => eng.gift(comment) },
          {
            key: "report",
            label: "Report",
            icon: <Icon as={Flag} size={22} className="text-overlay-danger" />,
            variant: "danger" as const,
            onSelect: () => eng.report(comment),
          },
        ]),
  ];

  return (
    <View>
      <Pressable
        ref={buttonRef}
        collapsable={false}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Comment options"
        hitSlop={10}
        className="-mr-1 p-1"
      >
        <Icon as={MoreHorizontal} size={iconSize} className="text-ink-muted" />
      </Pressable>
      {open ? <DropdownMenu anchorRef={buttonRef} onClose={() => setOpen(false)} items={items} width={176} /> : null}
    </View>
  );
}

/**
 * Reply · like · dislike for one comment, each with its own count (hidden at zero). `sm` is the compact row
 * under a reply; `lg` is the spaced-out bar under an opened comment.
 */
export function CommentActionBar({ comment, size = "sm" }: { comment: CommentWithAuthor; size?: "sm" | "lg" }) {
  const eng = useCommentEngagement();
  const { colors } = useTheme();
  const state = eng.reactions?.get(comment.id);
  const liked = !!state?.liked;
  const disliked = !!state?.disliked;
  const delta = eng.deltas.get(comment.id);
  const likeCount = Math.max(0, comment.like_count + (delta?.like ?? 0));
  const dislikeCount = Math.max(0, comment.dislike_count + (delta?.dislike ?? 0));

  const icon = size === "lg" ? 22 : 17;
  const countClass = size === "lg" ? "text-sm" : "text-xs";
  const countLine = size === "lg" ? 20 : 16;
  const wrapperClass = size === "lg" ? "flex-row items-center justify-around py-1" : "mt-1 -ml-1.5 flex-row items-center gap-7";
  const btn = "flex-row items-center gap-1.5 p-1.5";

  return (
    <View className={wrapperClass}>
      <Pressable onPress={() => eng.reply(comment)} accessibilityRole="button" accessibilityLabel="Reply" className={btn}>
        <Icon as={MessageCircle} size={icon} className="text-ink-muted" />
        <AnimatedCount value={comment.reply_count} lineHeight={countLine} className={`${countClass} text-ink-muted`} />
      </Pressable>

      <Pressable
        onPress={() => eng.toggleReaction({ commentId: comment.id, type: "like", currentlyActive: liked })}
        accessibilityRole="button"
        accessibilityLabel={liked ? "Unlike" : "Like"}
        accessibilityState={{ selected: liked }}
        className={btn}
      >
        <LikeHeart active={liked} size={icon} className={liked ? "text-danger" : "text-ink-muted"} />
        <AnimatedCount value={likeCount} lineHeight={countLine} className={`${countClass} ${liked ? "text-danger" : "text-ink-muted"}`} />
      </Pressable>

      <Pressable
        onPress={() => eng.toggleReaction({ commentId: comment.id, type: "dislike", currentlyActive: disliked })}
        accessibilityRole="button"
        accessibilityLabel={disliked ? "Remove dislike" : "Dislike"}
        accessibilityState={{ selected: disliked }}
        className={btn}
      >
        <ThumbsDown size={icon} color={disliked ? colors.danger : colors.inkMuted} fill={disliked ? colors.danger : "none"} />
        <AnimatedCount value={dislikeCount} lineHeight={countLine} className={`${countClass} ${disliked ? "text-danger" : "text-ink-muted"}`} />
      </Pressable>

      {size === "lg" ? (
        <Pressable onPress={() => eng.share(comment)} accessibilityRole="button" accessibilityLabel="Share" className={btn}>
          <Icon as={Share2} size={icon} className="text-ink-muted" />
        </Pressable>
      ) : null}
    </View>
  );
}
