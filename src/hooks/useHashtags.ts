// src/hooks/useHashtags.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { FEED_SELECT, normalizePost } from "./usePosts";
import type { PostWithAuthor } from "../types/database";

/**
 * Posts tagged with a given hashtag, via the post_hashtags join
 * table that create-post already populates. Powers the /hashtag/:tag
 * page that tapping a "#tag" in a post's content links to.
 *
 * Uses the same FEED_SELECT + normalizePost as every other post
 * query (feed, profile, bookmarks) — a hand-rolled select here
 * previously omitted profile_roles entirely, leaving post.author.roles
 * undefined and crashing PostCard's `post.author.roles.length` check
 * with no error boundary to catch it (blank screen on every tap).
 */
export function useHashtagPosts(tag: string) {
  return useQuery({
    queryKey: ["hashtag-posts", tag],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      const { data: hashtag } = await supabase
        .from("hashtags")
        .select("id")
        .eq("tag", tag.toLowerCase())
        .maybeSingle();

      if (!hashtag) return [];

      const { data: links } = await supabase
        .from("post_hashtags")
        .select("post_id")
        .eq("hashtag_id", hashtag.id);

      const postIds = (links ?? []).map((l) => l.post_id);
      if (postIds.length === 0) return [];

      const { data, error } = await supabase
        .from("posts")
        .select(FEED_SELECT)
        .in("id", postIds)
        .eq("is_deleted", false)
        .eq("is_archived", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as any[]).map(normalizePost);
    },
    enabled: !!tag,
  });
}
