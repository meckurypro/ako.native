// src/components/comments/CommentActionBar.tsx
import { Flag, Gift as GiftIcon, MessageCircle, MoreHorizontal, Pencil, Share2, ThumbsDown, Trash2 } from "lucide-react-native";
import { router, type Href } from "expo-router";
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
    ...(!isMine
      ? [{ key: "gift", label: "Gift", icon: <Icon as={GiftIcon} size={22} className="text-overlay-ink" />, onSelect: () => eng.gift(comment) }]
      : []),
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
      {open ? <DropdownMenu title="Comment options" anchorRef={buttonRef} onClose={() => setOpen(false)} items={items} width={176} /> : null}
    </View>
  );
}

/**
 * The row under a reply: like · replies · dislike, with a "…" on the right that holds everything else (share, gift,
 * report; edit / delete on your own). The replies count is every direct reply under this comment (add, question and
 * pushback together); tapping it opens the comment. There's no separate reply button — opening a comment is how you
 * reply (see ReplyBar in CommentDetail). Counts are hidden at zero.
 */
export function CommentActionBar({ comment }: { comment: CommentWithAuthor }) {
  const eng = useCommentEngagement();
  const { colors } = useTheme();
  const state = eng.reactions?.get(comment.id);
  const liked = !!state?.liked;
  const disliked = !!state?.disliked;
  const delta = eng.deltas.get(comment.id);
  const likeCount = Math.max(0, comment.like_count + (delta?.like ?? 0));
  const dislikeCount = Math.max(0, comment.dislike_count + (delta?.dislike ?? 0));
  const replyCount = Math.max(0, comment.reply_count);

  const icon = 17;
  const btn = "flex-row items-center gap-1.5 p-1.5";

  return (
    <View className="mt-1 -ml-1.5 flex-row items-center gap-7">
      <Pressable
        onPress={() => eng.toggleReaction({ commentId: comment.id, type: "like", currentlyActive: liked })}
        accessibilityRole="button"
        accessibilityLabel={liked ? "Unlike" : "Like"}
        accessibilityState={{ selected: liked }}
        className={btn}
      >
        <LikeHeart active={liked} size={icon} className={liked ? "text-danger" : "text-ink-muted"} />
        <AnimatedCount value={likeCount} lineHeight={16} className={`text-xs ${liked ? "text-danger" : "text-ink-muted"}`} />
      </Pressable>

      <Pressable
        onPress={() => router.push(`/post/${comment.post_id}/comment/${comment.id}` as Href)}
        accessibilityRole="button"
        accessibilityLabel={replyCount === 1 ? "1 reply" : `${replyCount} replies`}
        className={btn}
      >
        <MessageCircle size={icon} color={colors.inkMuted} />
        <AnimatedCount value={replyCount} lineHeight={16} className="text-xs text-ink-muted" />
      </Pressable>

      <Pressable
        onPress={() => eng.toggleReaction({ commentId: comment.id, type: "dislike", currentlyActive: disliked })}
        accessibilityRole="button"
        accessibilityLabel={disliked ? "Remove dislike" : "Dislike"}
        accessibilityState={{ selected: disliked }}
        className={btn}
      >
        <ThumbsDown size={icon} color={disliked ? colors.danger : colors.inkMuted} fill={disliked ? colors.danger : "none"} />
        <AnimatedCount value={dislikeCount} lineHeight={16} className={`text-xs ${disliked ? "text-danger" : "text-ink-muted"}`} />
      </Pressable>

      <View className="ml-auto">
        <CommentMoreMenu comment={comment} />
      </View>
    </View>
  );
}
