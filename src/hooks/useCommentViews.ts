// src/hooks/useCommentViews.ts
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Opening a comment counts as a view of it — the same unique-viewer model posts use (see
 * record_post_view / get_post_view_count). The RPC no-ops for the comment's own author and for repeat opens.
 */
export function useRecordCommentView(commentId: string | undefined, authorId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!commentId || !user || !authorId || user.id === authorId) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase.rpc("record_comment_view", { p_comment_id: commentId });
      if (error) {
        console.error("Failed to record comment view:", error);
        return;
      }
      if (!cancelled) queryClient.invalidateQueries({ queryKey: ["comment-view-count", commentId] });
    })();
    return () => {
      cancelled = true;
    };
  }, [commentId, authorId, user, queryClient]);
}

/** Unique viewers of a comment (openers + reactors, author excluded). */
export function useCommentViewCount(commentId: string | undefined) {
  return useQuery({
    queryKey: ["comment-view-count", commentId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("get_comment_view_count", { p_comment_id: commentId! });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: !!commentId,
    staleTime: 60 * 1000,
  });
}
