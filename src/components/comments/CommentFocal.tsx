// src/components/comments/CommentFocal.tsx
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import type { CommentWithAuthor } from "@/hooks/useComments";
import { useCommentViewCount } from "@/hooks/useCommentViews";
import { formatCompactCount, formatPostDate, formatPostTime } from "@/lib/formatStats";
import { renderFormattedText } from "@/lib/formatText";
import { CommentActionBar, CommentMoreMenu } from "./CommentActionBar";
import { useCommentEngagement } from "./CommentEngagement";

function Stat({ value, singular, plural }: { value: number; singular: string; plural: string }) {
  return (
    <Text className="text-sm text-ink-muted">
      <Text className="text-sm font-semibold text-ink">{formatCompactCount(value)}</Text> {value === 1 ? singular : plural}
    </Text>
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

      {comment.reply_count > 0 || likes > 0 || dislikes > 0 ? (
        <View className="flex-row flex-wrap items-center gap-x-5 gap-y-1 border-b border-border py-3">
          {comment.reply_count > 0 ? <Stat value={comment.reply_count} singular="Reply" plural="Replies" /> : null}
          {likes > 0 ? <Stat value={likes} singular="Like" plural="Likes" /> : null}
          {dislikes > 0 ? <Stat value={dislikes} singular="Dislike" plural="Dislikes" /> : null}
        </View>
      ) : null}

      <View className="border-b border-border">
        <CommentActionBar comment={comment} size="lg" />
      </View>
    </View>
  );
}
