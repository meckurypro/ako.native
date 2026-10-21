// src/screens/PostDetail.tsx
// A post, opened. The post sits at the top (opening it counts as a view), its direct replies follow right
// beneath it on the same page — no overlay, nothing to close. Each reply is tinted by its stance toward the
// post; tapping one opens it as the parent of its own thread (see CommentDetail).
//   /post/:id                  → the post with its replies below
//   /post/:id?comment=<id>     → legacy link shape; forwarded to /post/:id/comment/<id>
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react-native";
import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CommentEngagementProvider } from "@/components/comments/CommentEngagement";
import { CommentReplies } from "@/components/comments/CommentReplies";
import { ReplyBar } from "@/components/comments/ReplyBar";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { PostCard } from "@/components/post/PostCard";
import { StanceComposer } from "@/components/post/StanceComposer";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { PostStatusBanner } from "@/components/post/PostStatusBanner";
import { RestrictedPostNotice } from "@/components/ui/RestrictedPostNotice";
import { UnavailableNotice } from "@/components/ui/UnavailableNotice";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { useAuth } from "@/hooks/useAuth";
import { useMarkPostSeen } from "@/hooks/useMarkPostSeen";
import { usePost } from "@/hooks/usePostDetail";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSmartBack } from "@/hooks/useSmartBack";
import { isPublished } from "@/lib/postStatus";
import type { Stance } from "@/types/database";

export function PostDetail() {
  const { postId, comment: legacyCommentId } = useLocalSearchParams<{ postId: string; comment?: string }>();
  const smartBack = useSmartBack();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Restricted (consumer-only) accounts can't use posts yet. A shared post link must not tell them the post
  // "doesn't exist" — it does — so skip the fetch entirely and explain, with a way to Discover.
  const restricted = useIsRestricted();
  const { data: post, isLoading: postLoading, refetch: refetchPost } = usePost(restricted ? undefined : postId);
  const { refreshControl, refreshing } = usePullToRefresh(
    [refetchPost, () => queryClient.invalidateQueries({ queryKey: ["comment-list", postId] })],
    insets.top + 16
  );
  const repliesY = useRef(0);
  const [composeStance, setComposeStance] = useState<Stance | null>(null);

  useMarkPostSeen(postId, restricted ? undefined : post?.author?.id);

  // Older share links and notifications pointed at /post/{id}?comment={commentId}. Comments are pages of their
  // own now, so those links are forwarded to the opened-comment page instead of going stale.
  if (legacyCommentId) return <Redirect href={`/post/${postId}/comment/${legacyCommentId}` as Href} />;

  // Only reachable at all (row returned despite is_deleted/is_archived) if the viewer is the author or an
  // admin — RLS hides removed posts from everyone else. A stranger hitting a dead link gets `post === null`
  // below instead, with no attribution since we have nothing (correctly) to tell them.
  const isOwnPost = !!user && !!post && post.author?.id === user.id;
  const removedByViewer = !!user && post?.deleted_by === user.id;
  const removerName = post?.remover?.display_name || post?.remover?.username;

  // No replies on a draft or scheduled post — it isn't live, so there is no conversation to join yet.
  const showThread = !!post && !post.is_deleted && !(post.is_archived && !isOwnPost) && isPublished(post);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView showsHorizontalScrollIndicator={false}
        refreshControl={refreshControl}
        ref={onScroll.listRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: bottomInset, opacity: refreshing ? 0 : 1 }}
      >
        <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} className="mb-3 self-start">
          <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
        </Pressable>

        {restricted ? (
          <RestrictedPostNotice />
        ) : postLoading ? (
          <Text className="text-ink-muted">Loading…</Text>
        ) : !post ? (
          <UnavailableNotice kind="post" />
        ) : post.is_deleted ? (
          <UnavailableNotice
            kind="post"
            reason={removedByViewer ? "You deleted this post." : removerName ? `${removerName} removed this post.` : undefined}
          />
        ) : post.is_archived && !isOwnPost ? (
          <UnavailableNotice kind="post" />
        ) : (
          <>
            {post.is_archived && isOwnPost ? (
              <View className="mb-3 rounded-lg border border-border bg-surface px-3 py-2">
                <Text className="text-xs text-ink-muted">Only you can see this — you archived it.</Text>
              </View>
            ) : null}

            <PostStatusBanner post={post} isOwnPost={isOwnPost} />

            <PostCard
              post={post}
              showStats
              onRequestOpenComments={() => onScroll.listRef.current?.scrollTo?.({ y: Math.max(0, repliesY.current - insets.top - 8), animated: true })}
            />
          </>
        )}

        {showThread && post ? (
          <CommentEngagementProvider key={post.id} postId={post.id}>
            <View onLayout={(e) => (repliesY.current = e.nativeEvent.layout.y)}>
              <ReplyBar
                placeholder="Add your reasoning…"
                // The post's own author can only build on their own post.
                stances={isOwnPost ? ["support"] : undefined}
                onOpen={setComposeStance}
              />
              <CommentReplies
                postId={post.id}
                parentCommentId={null}
                total={post.comment_count}
                counts={{ support: post.support_count, disagree: post.disagree_count, pushback: post.pushback_count }}
              />
            </View>

            {composeStance ? (
              <StanceComposer
                postId={post.id}
                stance={composeStance}
                stances={isOwnPost ? ["support"] : undefined}
                onClose={() => setComposeStance(null)}
              />
            ) : null}
          </CommentEngagementProvider>
        ) : null}
      </ScrollView>
    </View>
  );
}
