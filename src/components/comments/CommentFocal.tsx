// src/components/comments/CommentFocal.tsx
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { AnimatedCount } from "@/components/ui/AnimatedCount";
import { LikeHeart } from "@/components/ui/LikeHeart";
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
  const state = eng.reactions?.get(comment.id);
  const liked = !!state?.liked;
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

      {/* One stats row, always on a single line: time · date · views on the left; comment count, heart and the "…" on the
          right. The heart is the like control itself, so nothing repeats underneath. */}
      <View className="mt-3 flex-row items-center justify-between border-b border-border pb-1">
        <View className="flex-shrink-0 flex-row items-center gap-x-1.5 py-1.5">
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

        <View className="flex-shrink-0 flex-row items-center gap-x-3">
          <View className="flex-row items-center gap-x-1.5 py-1.5">
            <AnimatedCount value={comment.reply_count} showZero lineHeight={20} className="text-sm font-semibold text-ink" />
            <Text className="text-sm text-ink-muted">{comment.reply_count === 1 ? "Comment" : "Comments"}</Text>
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
          <CommentMoreMenu comment={comment} iconSize={18} />
        </View>
      </View>
    </View>
  );
}
