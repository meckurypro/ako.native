// src/components/comments/CommentFocal.tsx
import { Gift as GiftIcon, Share2, ThumbsDown } from "lucide-react-native";
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

function Stat({ value, singular, plural }: { value: number; singular: string; plural: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <AnimatedCount value={value} showZero lineHeight={20} className="text-sm font-semibold text-ink" />
      <Text className="text-sm text-ink-muted">{value === 1 ? singular : plural}</Text>
    </View>
  );
}

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
  const shares = comment.share_count ?? 0;
  const { colors } = useTheme();
  const state = eng.reactions?.get(comment.id);
  const liked = !!state?.liked;
  const disliked = !!state?.disliked;
  const isMine = !!eng.currentUserId && comment.author.id === eng.currentUserId;
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
        <CommentMoreMenu comment={comment} iconSize={18} />
      </View>

      <Text className="mt-3 text-lg leading-snug text-ink">{renderFormattedText(comment.content, "c")}</Text>

      <View className="mt-3 flex-row flex-wrap items-center gap-x-1.5 border-b border-border pb-3">
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

      {/* One row does double duty: the live counts AND the controls, all at the stats' own size. */}
      <View className="flex-row flex-wrap items-center gap-x-5 gap-y-0 border-b border-border py-1.5">
        {comment.reply_count > 0 ? (
          <View className="py-1.5">
            <Stat value={comment.reply_count} singular="Reply" plural="Replies" />
          </View>
        ) : null}
        <Pressable
          onPress={() => eng.toggleReaction({ commentId: comment.id, type: "like", currentlyActive: liked })}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Unlike" : "Like"}
          accessibilityState={{ selected: liked }}
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
          className="flex-row items-center gap-1.5 py-1.5"
        >
          <ThumbsDown size={16} color={disliked ? colors.danger : colors.inkMuted} fill={disliked ? colors.danger : "none"} />
          <AnimatedCount value={dislikes} showZero lineHeight={20} className={`text-sm font-semibold ${disliked ? "text-danger" : "text-ink"}`} />
        </Pressable>
        <Pressable onPress={() => eng.share(comment)} accessibilityRole="button" accessibilityLabel="Share" className="flex-row items-center gap-1.5 py-1.5">
          <Icon as={Share2} size={16} className="text-ink-muted" />
          <AnimatedCount value={shares} showZero lineHeight={20} className="text-sm font-semibold text-ink" />
        </Pressable>
        {!isMine ? (
          <Pressable onPress={() => eng.gift(comment)} accessibilityRole="button" accessibilityLabel="Send a gift" className="flex-row items-center py-1.5">
            <Icon as={GiftIcon} size={16} className="text-ink-muted" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
