// src/hooks/useRecordPostView.ts
import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

// Posts already reported this session — a unique viewer counts once.
const reported = new Set<string>();

const DWELL_MS = 1000; // must stay on screen this long to count as seen

/**
 * Counts a feed impression: once `visible` (card ≥60% on screen, from the
 * feed list) has held for ~1s, calls the record_post_view RPC (idempotent
 * per user+post; the author's own views are ignored server-side). The
 * count on PostDetail comes from get_post_view_count (see usePostViewCount).
 */
export function useRecordPostView(postId: string, visible: boolean) {
  const { user } = useAuth();

  useEffect(() => {
    if (!visible || !user || !postId) return;
    const key = `${user.id}:${postId}`;
    if (reported.has(key)) return;

    const timer = setTimeout(async () => {
      reported.add(key);
      const { error } = await supabase.rpc("record_post_view", { p_post_id: postId });
      if (error) {
        reported.delete(key);
        console.error("Failed to record post view:", error);
      }
    }, DWELL_MS);
    return () => clearTimeout(timer);
  }, [postId, visible, user]);
}
