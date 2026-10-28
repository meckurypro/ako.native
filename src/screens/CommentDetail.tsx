// src/screens/CommentDetail.tsx
// A comment, opened — it becomes the "parent" of its own thread exactly like a post does: the conversation
// above it (the post, then each comment down to this one) is shown quietly for context, the comment itself is
// laid out large and neutral, and its replies follow below tinted by their stance toward IT. Opening it counts
// as a view of the comment.
//   /post/:postId/comment/:commentId
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react-native";
import { BrandDot } from "@/components/ui/BrandDot";
import { Redirect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CommentEngagementProvider, useCommentEngagement } from "@/components/comments/CommentEngagement";
import { CommentFocal } from "@/components/comments/CommentFocal";
import { CommentReplies } from "@/components/comments/CommentReplies";
import { ReplyBar } from "@/components/comments/ReplyBar";
import { timeAgoCompact } from "@/components/comments/stance";
import { ThreadContextGap, ThreadContextRow } from "@/components/comments/ThreadContextRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { RestrictedPostNotice } from "@/components/ui/RestrictedPostNotice";
import { UnavailableNotice } from "@/components/ui/UnavailableNotice";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { useComment, useCommentChain, type CommentWithAuthor } from "@/hooks/useComments";
import { useRecordCommentView } from "@/hooks/useCommentViews";
import { useMarkPostSeen } from "@/hooks/useMarkPostSeen";
import { usePost, type PostDetailData } from "@/hooks/usePostDetail";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSmartBack } from "@/hooks/useSmartBack";
import { renderFormattedText } from "@/lib/formatText";

function PostContext({ post }: { post: PostDetailData | null | undefined }) {
  if (!post || post.is_deleted || post.is_archived) {
    return <ThreadContextGap label="The original post isn't available." />;
  }
  const name = post.posted_as_page?.name ?? post.author.display_name;
  const avatar = post.posted_as_page?.avatar_url ?? post.author.avatar_url;
  const text = post.content.trim() || post.heading || "Shared a post";
  return (
    <ThreadContextRow to={`/post/${post.id}`} name={name} avatarUrl={avatar} meta={`· ${timeAgoCompact(post.created_at)}`}>
      {post.heading && post.content.trim() ? <Text className="font-medium text-ink">{post.heading} </Text> : null}
      {renderFormattedText(text, "p")}
    </ThreadContextRow>
  );
}

function AncestorChain({ chain, postId }: { chain: (CommentWithAuthor | null)[]; postId: string }) {
  return (
    <>
      {chain.map((c, i) =>
        c ? (
          <ThreadContextRow
            key={c.id}
            to={`/post/${postId}/comment/${c.id}`}
            name={c.author.display_name}
            avatarUrl={c.author.avatar_url}
            meta={`· ${timeAgoCompact(c.created_at)}`}
          >
            {renderFormattedText(c.content, "c")}
          </ThreadContextRow>
        ) : (
          <ThreadContextGap key={`gap-${i}`} label="This comment isn't available." />
        )
      )}
    </>
  );
}

function CommentThreadBody({ comment }: { comment: CommentWithAuthor }) {
  const eng = useCommentEngagement();
  return (
    <>
      <ReplyBar placeholder={`Reply to ${comment.author.display_name}…`} onOpen={(s) => eng.reply(comment, s)} />
      <CommentReplies
        postId={comment.post_id}
        parentCommentId={comment.id}
        total={comment.reply_count}
        counts={{ support: comment.support_count + comment.neutral_count, question: comment.question_count, pushback: comment.pushback_count, comment: 0 }}
      />
    </>
  );
}

export function CommentDetail() {
  const { postId, commentId } = useLocalSearchParams<{ postId: string; commentId: string }>();
  const smartBack = useSmartBack();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const queryClient = useQueryClient();
  // Restricted accounts can't use posts yet: skip every fetch and explain instead of implying the link is dead.
  const restricted = useIsRestricted();
  const { data: comment, isLoading: commentLoading, refetch: refetchComment } = useComment(restricted ? undefined : commentId);
  const { data: chain, isLoading: chainLoading } = useCommentChain(restricted ? undefined : commentId);
  const { data: post, isLoading: postLoading } = usePost(restricted ? undefined : postId);
  const { refreshControl, refreshing } = usePullToRefresh(
    [refetchComment, () => queryClient.invalidateQueries({ queryKey: ["comment-list", postId] })],
    insets.top + 16
  );

  const headerH = useRef(0);
  const scrolledFor = useRef<string | null>(null);

  useRecordCommentView(comment?.id, comment?.author.id);
  // Opening a comment is also being in that post's conversation — keep the post's "seen" bookkeeping honest.
  useMarkPostSeen(postId, restricted ? undefined : post?.author?.id);

  const ready = !!comment && !!chain && !postLoading;

  // Like a conversation view: when there's context above, start with the opened comment at the top and let the
  // context sit just above the fold. Runs once per opened comment; going back to a screen keeps its own scroll.
  function onFocalLayout(y: number) {
    if (!ready || !comment || scrolledFor.current === comment.id) return;
    scrolledFor.current = comment.id;
    if (y <= 0) return;
    requestAnimationFrame(() => onScroll.listRef.current?.scrollTo?.({ y: Math.max(0, y - headerH.current), animated: false }));
  }

  if (comment && postId && comment.post_id !== postId) {
    return <Redirect href={`/post/${comment.post_id}/comment/${comment.id}` as Href} />;
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView showsHorizontalScrollIndicator={false}
        refreshControl={refreshControl}
        ref={onScroll.listRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset, opacity: refreshing ? 0 : 1 }}
      >
        <View
          onLayout={(e) => (headerH.current = e.nativeEvent.layout.height)}
          className="-mx-4 flex-row items-center gap-4 bg-canvas-a90 px-4 pb-3"
          style={{ paddingTop: insets.top + 12 }}
        >
          <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
            <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
          </Pressable>
          <View className="flex-row items-center gap-1.5">
            <Text className="font-display text-base text-ink">Comment</Text>
            <BrandDot />
          </View>
        </View>

        {restricted ? (
          <RestrictedPostNotice />
        ) : commentLoading || chainLoading ? (
          <Text className="py-6 text-ink-muted">Loading…</Text>
        ) : !comment || comment.is_deleted ? (
          <View>
            <UnavailableNotice kind="comment" />
            {postId ? (
              <Pressable onPress={() => router.replace(`/post/${postId}` as Href)} accessibilityRole="link" className="items-center">
                <Text className="text-sm font-medium text-accent">View the post</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <CommentEngagementProvider key={comment.id} postId={comment.post_id}>
            <PostContext post={post} />
            <AncestorChain chain={chain ?? []} postId={comment.post_id} />

            <View onLayout={(e) => onFocalLayout(e.nativeEvent.layout.y)}>
              <CommentFocal comment={comment} />
            </View>

            <CommentThreadBody comment={comment} />
          </CommentEngagementProvider>
        )}
      </ScrollView>
    </View>
  );
}
