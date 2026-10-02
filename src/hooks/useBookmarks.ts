import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { PROFILE_ROLES_SELECT, toProfileRoles } from "../lib/profileRoles";
import type { PostWithAuthor } from "../types/database";

import { DEBUG_DISABLE_PER_CARD_QUERIES } from "../lib/debugFlags";
import { PAGE_SELECT } from "../lib/postSelects";

// `enabled` lets a caller defer this until the card is actually worth
// fetching for — see PostCard's `active` prop, which Feed.tsx sets false
// for cards in a feed tab the visitor hasn't swiped to yet. Without it,
// SwipeableTabs mounting all three tabs' cards at once each fired this
// (plus like/dislike/hasReshared below) immediately, so a fresh Feed
// load could kick off dozens of simultaneous Supabase requests before
// the visitor had even looked at two of the three tabs.
export function useIsBookmarked(postId: string, enabled: boolean = true) {
  const { user } = useAuth();

  return useQuery({
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
}

export function useToggleBookmark(postId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (currentlyBookmarked: boolean) => {
      if (!user) throw new Error("Not signed in");

      if (currentlyBookmarked) {
        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("bookmarks")
          .insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["is-bookmarked", postId] });
      queryClient.invalidateQueries({ queryKey: ["bookmarked-posts"] });
    },
  });
}

export function useBookmarkedPosts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["bookmarked-posts", user?.id],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      const { data, error } = await supabase
        .from("bookmarks")
        .select(
          `post:posts!bookmarks_post_id_fkey(*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, tier, is_private, is_verified, ${PROFILE_ROLES_SELECT}), ${PAGE_SELECT})`
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
