// src/hooks/useMarkPostSeen.ts  (pulled out of PostDetail.tsx for clarity)
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Records that the current user has seen this post — powers the
 * unseen-post "ring" on chat avatars (see useUnseenPosts.ts) AND the
 * Activity hub's "History" tab (see useViewHistory.ts). No-ops if the
 * viewer is the post's own author.
 *
 * Upserts on (user_id, post_id) so a re-view bumps viewed_at instead
 * of being ignored — the ring only cares whether a row exists at all
 * (unaffected by this), but History wants most-recently-viewed order,
 * which needs the timestamp to actually move on repeat views.
 *
 * Uses supabase-js directly (the web build's keepalive fetch isn't needed on native).
 */
export function useMarkPostSeen(postId: string, authorId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!postId || !user || !authorId) return;
    if (user.id === authorId) return; // don't track authors viewing their own post

    let cancelled = false;

    (async () => {
      try {
        // Upsert on (user_id, post_id) so a re-view bumps viewed_at.
        // (The web build used a raw keepalive fetch so the write survived a
        // page unload; a native app has no unload, so the client is enough.)
        const { error } = await supabase
          .from("post_views")
          .upsert(
            { user_id: user.id, post_id: postId, viewed_at: new Date().toISOString() },
            { onConflict: "user_id,post_id" }
          );
        if (cancelled) return;

        if (error && error.code !== "409") {
          console.error("Failed to mark post as seen:", error);
          return;
        }

        queryClient.invalidateQueries({ queryKey: ["unseen-posts"] });
        queryClient.invalidateQueries({ queryKey: ["view-history"] });
        // Keep the comment-row view count in step with the view just recorded.
        queryClient.invalidateQueries({ queryKey: ["post-view-count", postId] });
      } catch (err) {
        console.error("Failed to mark post as seen:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [postId, user, authorId, queryClient]);
}
