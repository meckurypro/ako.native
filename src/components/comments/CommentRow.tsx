// src/components/comments/CommentRow.tsx
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import type { CommentWithAuthor } from "@/hooks/useComments";
import { renderFormattedText } from "@/lib/formatText";
import { CommentActionBar, CommentMoreMenu } from "./CommentActionBar";
import { STANCE_TONE, timeAgoCompact } from "./stance";

/**
 * One reply in a list. Tapping anywhere on it opens it as the parent of its own replies
 * (/post/:postId/comment/:id) — there's no inline expansion any more.
 *
 * `tinted` shows the reply's stance toward whatever list it sits in (a 2px rail + a tiny label). It's on in
 * reply lists and off for neutral context rows like ancestors.
 */
export function CommentRow({ comment, tinted = true }: { comment: CommentWithAuthor; tinted?: boolean }) {
  // The neutral "comment" stance draws nothing: no rail, no label.
  const tone = tinted && comment.stance && comment.stance !== "comment" ? STANCE_TONE[comment.stance] : null;
  const profileHref = `/profile/${comment.author.username}` as Href;

  return (
    <Pressable
      onPress={() => router.push(`/post/${comment.post_id}/comment/${comment.id}` as Href)}
      accessibilityRole="link"
      className="flex-row items-start gap-3 border-b border-border-a60 py-3 pl-3 pr-1 active:bg-surface"
    >
      {tone ? <View className={`absolute bottom-3 left-0 top-3 w-0.5 rounded-full ${tone.rail}`} /> : null}

      <Pressable onPress={() => router.push(profileHref)} accessibilityRole="link" className="flex-shrink-0">
        <Avatar src={comment.author.avatar_url} name={comment.author.display_name} size="sm" />
      </Pressable>

      <View className="min-w-0 flex-1">
        <View className="min-w-0 flex-row items-center gap-1.5">
          <Text numberOfLines={1} onPress={() => router.push(profileHref)} accessibilityRole="link" className="flex-shrink text-sm font-medium text-ink">
            {comment.author.display_name}
          </Text>
          <Text className="flex-shrink-0 text-xs text-ink-muted">· {timeAgoCompact(comment.created_at)}</Text>
          {comment.edited_at ? <Text className="flex-shrink-0 text-xs text-ink-muted">· edited</Text> : null}
          {tone ? <Text className={`flex-shrink-0 text-[11px] font-medium ${tone.text}`}>· {tone.label}</Text> : null}
          <View className="ml-auto flex-shrink-0 pl-2">
            <CommentMoreMenu comment={comment} />
          </View>
        </View>

        <Text className="mt-0.5 text-[15px] leading-snug text-ink">{renderFormattedText(comment.content, "c")}</Text>

        <CommentActionBar comment={comment} size="sm" />
      </View>
    </Pressable>
  );
}
