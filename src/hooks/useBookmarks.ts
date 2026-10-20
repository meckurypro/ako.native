import { useCallback } from "react";
import { useQuery, useMutation, useMutationState } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { PROFILE_ROLES_SELECT, toProfileRoles } from "../lib/profileRoles";
import type { PostWithAuthor } from "../types/database";

import { DEBUG_DISABLE_PER_CARD_QUERIES } from "../lib/debugFlags";
import { PAGE_SELECT } from "../lib/postSelects";
import { BOOKMARK_MUTATION_KEY, bookmarkScope, type BookmarkIntent } from "../lib/offlineMutations";

// `enabled` lets a caller defer this until the card is actually worth
// fetching for — see PostCard's `active` prop, which Feed.tsx sets false
// for cards in a feed tab the visitor hasn't swiped to yet. Without it,
// SwipeableTabs mounting all three tabs' cards at once each fired this
// (plus like/dislike/hasReshared below) immediately, so a fresh Feed
// load could kick off dozens of simultaneous Supabase requests before
// the visitor had even looked at two of the three tabs.
export function useIsBookmarked(postId: string, enabled: boolean = true) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["is-bookmarked", postId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("bookmarks")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && enabled && !DEBUG_DISABLE_PER_CARD_QUERIES,
  });

  // Overlay any unconfirmed save/unsave (pending, retrying, or queued offline) so the icon flips instantly.
  const pending = useMutationState({
    filters: { mutationKey: BOOKMARK_MUTATION_KEY, status: "pending" },
    select: (m) => m.state.variables as BookmarkIntent | undefined,
  });
  let intent: boolean | undefined;
  for (const v of pending) if (v && v.postId === postId) intent = v.active;

  return { ...query, data: intent ?? query.data };
}

/**
 * Offline-first save/unsave: queues an idempotent intent and returns immediately (see lib/offlineMutations.ts).
 * `mutate(currentlyBookmarked)` takes what the user sees.
 */
export function useToggleBookmark(postId: string) {
  const { user } = useAuth();
  const { mutate: enqueue } = useMutation<void, Error, BookmarkIntent>({
    mutationKey: BOOKMARK_MUTATION_KEY,
    scope: { id: bookmarkScope(postId) },
  });

  const mutate = useCallback(
    (currentlyBookmarked: boolean) => {
      if (!user) return;
      enqueue({ postId, active: !currentlyBookmarked, userId: user.id, queuedAt: Date.now() });
    },
    [user, enqueue, postId]
  );

  return { mutate };
}

export function useBookmarkedPosts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["bookmarked-posts", user?.id],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      const { data, error } = await supabase
        .from("bookmarks")
        .select(
          `post:posts!bookmarks_post_id_fkey(*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, tier, is_private, is_verified, badge_visible, ${PROFILE_ROLES_SELECT}), ${PAGE_SELECT})`
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((row: any) => row.post)
        .filter(Boolean)
        .map((post: any) => {
          const { profile_roles, ...author } = post.author ?? {};
          return { ...post, author: { ...author, roles: toProfileRoles(profile_roles) } };
        });
    },
    enabled: !!user,
  });
}
