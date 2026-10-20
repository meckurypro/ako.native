// src/hooks/useLiveCounts.ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { watchPost, watchThread } from "../lib/liveCounts";

/** Keeps one post's counters live while it is on screen (see lib/liveCounts.ts). */
export function useLivePost(postId: string | undefined, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!postId || !enabled) return;
    return watchPost(qc, postId);
  }, [qc, postId, enabled]);
}

/** Keeps an open conversation live: comment counters, new replies, removed replies. */
export function useLiveThread(postId: string | undefined, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!postId || !enabled) return;
    return watchThread(qc, postId);
  }, [qc, postId, enabled]);
}
