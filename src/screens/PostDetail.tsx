// src/screens/PostDetail.tsx
// A single post (with stats) and, by default, its comments open over it.
//   /post/:id                  → comments sheet opens automatically
//   /post/:id?view=post        → just the post (reached from a repost badge); comments start closed
//   /post/:id?comment=<id>     → comments open, that comment's ancestors expanded, scrolled to and flashed
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { CommentSheet } from "@/components/post/CommentSheet";
import { PostCard } from "@/components/post/PostCard";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { UnavailableNotice } from "@/components/ui/UnavailableNotice";
import { useAuth } from "@/hooks/useAuth";
import { useMarkPostSeen } from "@/hooks/useMarkPostSeen";
import { useSmartBack } from "@/hooks/useSmartBack";
import { supabase } from "@/lib/supabase";
import { PAGE_SELECT } from "@/lib/postSelects";
import { PROFILE_ROLES_SELECT, toProfileRoles } from "@/lib/profileRoles";
import type { PostWithAuthor } from "@/types/database";

const POST_SELECT = `*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, tier, is_private, ${PROFILE_ROLES_SELECT}), remover:profiles!posts_deleted_by_fkey(username, display_name), ${PAGE_SELECT}`;

// Unlike the feed queries, this one must also return deleted/archived rows the
// viewer is allowed to see, so the page can say WHY a post is gone.
interface PostDetailData extends PostWithAuthor {
  is_deleted: boolean;
  is_archived: boolean;
  deleted_by: string | null;
  remover: { username: string; display_name: string } | null;
}

function usePost(postId: string) {
  return useQuery({
    queryKey: ["post", postId],
    queryFn: async (): Promise<PostDetailData | null> => {
      const { data, error } = await supabase.from("posts").select(POST_SELECT).eq("id", postId).maybeSingle();
      if (error) throw error;
      if (!data) return null; // RLS hid it entirely — deleted/archived and the viewer has no special access

      const raw = data as unknown as PostDetailData & { author: { profile_roles?: unknown } | null };
      return {
        ...raw,
        author: raw.author ? { ...raw.author, roles: toProfileRoles(raw.author.profile_roles as never) } : raw.author,
      } as PostDetailData;
    },
    enabled: !!postId,
  });
}

export function PostDetail() {
  const { postId, view, comment } = useLocalSearchParams<{ postId: string; view?: string; comment?: string }>();
  const smartBack = useSmartBack();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { user } = useAuth();
  const { data: post, isLoading: postLoading } = usePost(postId);

  const highlightId = comment ?? null;
  const viewOnly = view === "post";
  const [manuallyOpened, setManuallyOpened] = useState(false);
  useEffect(() => setManuallyOpened(false), [postId]);
  const commentsOpen = highlightId ? true : viewOnly ? manuallyOpened : true;

  useMarkPostSeen(postId, post?.author?.id);

  const isOwnPost = !!user && !!post && post.author?.id === user.id;
  const removedByViewer = !!user && post?.deleted_by === user.id;
  const removerName = post?.remover?.display_name || post?.remover?.username;

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: bottomInset }}
      >
        <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} className="mb-3 self-start">
          <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
        </Pressable>

        {postLoading ? (
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

            <PostCard post={post} showStats onRequestOpenComments={() => setManuallyOpened(true)} />
          </>
        )}
      </ScrollView>

      {/* The discussion is the point of this page, so the comment sheet opens by
          itself over the post. In ?view=post mode it starts closed, and closing it
          returns to the post instead of leaving the page. */}
      {post && !post.is_deleted && !(post.is_archived && !isOwnPost) && commentsOpen ? (
        <CommentSheet
          postId={post.id}
          commentCount={post.comment_count}
          isOwner={isOwnPost}
          highlightId={highlightId}
          onClose={viewOnly ? () => setManuallyOpened(false) : smartBack}
        />
      ) : null}
    </View>
  );
}
