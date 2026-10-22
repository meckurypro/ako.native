// src/components/comments/CommentFocal.tsx
import { MessageSquare, ThumbsDown } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { AnimatedCount } from "@/components/ui/AnimatedCount";
import { LikeHeart } from "@/components/ui/LikeHeart";
import { Icon } from "@/components/ui/styled";
import { useTheme } from "@/theme/ThemeProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import type { CommentWithAuthor } from "@/hooks/useComments";
import { useCommentViewCount } from "@/hooks/useCommentViews";
import { formatCompactCount, formatPostDate, formatPostTime } from "@/lib/formatStats";
import { renderFormattedText } from "@/lib/formatText";
import { CommentMoreMenu } from "./CommentActionBar";
import { useCommentEngagement } from "./CommentEngagement";

/**
 * A comment opened as the parent of its own thread — laid out like a post's expanded view (big text,
 * time · date · views, counts, spaced actions) and deliberately NOT stance-tinted: here it's the subject, and
 * it's the replies beneath that carry colour.
 */
export function CommentFocal({ comment }: { comment: CommentWithAuthor }) {
  const eng = useCommentEngagement();
  const views = useCommentViewCount(comment.id).data ?? 0;
  const delta = eng.deltas.get(comment.id);
  const likes = Math.max(0, comment.like_count + (delta?.like ?? 0));
  const dislikes = Math.max(0, comment.dislike_count + (delta?.dislike ?? 0));
  const { colors } = useTheme();
  const state = eng.reactions?.get(comment.id);
  const liked = !!state?.liked;
  const disliked = !!state?.disliked;
  const profileHref = `/profile/${comment.author.username}` as Href;

  return (
    <View className="pt-4">
      <View className="flex-row items-center gap-3">
        <Pressable onPress={() => router.push(profileHref)} accessibilityRole="link" className="flex-shrink-0">
          <Avatar src={comment.author.avatar_url} name={comment.author.display_name} size="md" />
        </Pressable>
        <Pressable onPress={() => router.push(profileHref)} accessibilityRole="link" className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[15px] font-medium text-ink">
            {comment.author.display_name}
          </Text>
          <Text numberOfLines={1} className="text-sm text-ink-muted">
            @{comment.author.username}
          </Text>
        </Pressable>
      </View>

      <Text className="mt-3 text-lg leading-snug text-ink">{renderFormattedText(comment.content, "c")}</Text>

      {/* One stats row: time · date · views on the left; reply count, heart, dislike and the "…" on the right. The heart and
          thumb are the like / dislike controls themselves, so nothing repeats underneath. */}
      <View className="mt-3 flex-row flex-wrap items-center justify-between gap-x-3 border-b border-border pb-1">
        <View className="flex-row flex-wrap items-center gap-x-1.5 py-1.5">
          <Text className="text-sm text-ink-muted">{formatPostTime(comment.created_at)}</Text>
          <Text className="text-sm text-ink-muted">·</Text>
          <Text className="text-sm text-ink-muted">{formatPostDate(comment.created_at)}</Text>
          <Text className="text-sm text-ink-muted">·</Text>
          <Text className="text-sm font-semibold text-ink">{formatCompactCount(views)}</Text>
          <Text className="text-sm text-ink-muted">{views === 1 ? "View" : "Views"}</Text>
          {comment.edited_at ? (
            <>
              <Text className="text-sm text-ink-muted">·</Text>
              <Text className="text-sm text-ink-muted">Edited</Text>
            </>
          ) : null}
        </View>

        <View className="ml-auto flex-row items-center gap-x-4">
          <View className="flex-row items-center gap-1.5 py-1.5" accessibilityLabel={`${comment.reply_count} ${comment.reply_count === 1 ? "reply" : "replies"}`}>
            <Icon as={MessageSquare} size={16} className="text-ink-muted" />
            <AnimatedCount value={comment.reply_count} showZero lineHeight={20} className="text-sm font-semibold text-ink" />
          </View>
          <Pressable
            onPress={() => eng.toggleReaction({ commentId: comment.id, type: "like", currentlyActive: liked })}
            accessibilityRole="button"
            accessibilityLabel={liked ? "Unlike" : "Like"}
            accessibilityState={{ selected: liked }}
            hitSlop={6}
            className="flex-row items-center gap-1.5 py-1.5"
          >
            <LikeHeart active={liked} size={16} className={liked ? "text-danger" : "text-ink-muted"} />
            <AnimatedCount value={likes} showZero lineHeight={20} className={`text-sm font-semibold ${liked ? "text-danger" : "text-ink"}`} />
          </Pressable>
          <Pressable
            onPress={() => eng.toggleReaction({ commentId: comment.id, type: "dislike", currentlyActive: disliked })}
            accessibilityRole="button"
            accessibilityLabel={disliked ? "Remove dislike" : "Dislike"}
            accessibilityState={{ selected: disliked }}
            hitSlop={6}
            className="flex-row items-center gap-1.5 py-1.5"
          >
            <ThumbsDown size={16} color={disliked ? colors.danger : colors.inkMuted} fill={disliked ? colors.danger : "none"} />
            <AnimatedCount value={dislikes} showZero lineHeight={20} className={`text-sm font-semibold ${disliked ? "text-danger" : "text-ink"}`} />
          </Pressable>
          <CommentMoreMenu comment={comment} iconSize={18} />
        </View>
      </View>
    </View>
  );
}
