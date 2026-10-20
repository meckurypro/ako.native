// src/hooks/usePostRealtime.ts
// Live post edits. A database trigger broadcasts every real content edit (heading / text / media / archive / delete)
// on the private "post-edits" channel; this patches that straight into every cached copy of the post, so an edit made
// on another device — or by another author — appears without a refresh, pull-to-refresh or app restart.
// Broadcast (not postgres_changes on `posts`) keeps this cheap: clients are NOT woken for every like-count bump.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useAuth } from "./useAuth";
import { EDITABLE_POST_FIELDS, patchFieldsInCaches, pickFields, POST_QUERY_ROOTS } from "../lib/optimisticCache";
import { supabase } from "../lib/supabase";

export function usePostRealtime(): void {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("post-edits", { config: { private: true } })
      .on("broadcast", { event: "post_edited" }, ({ payload }) => {
        const id = (payload as { id?: unknown } | null)?.id;
        if (typeof id !== "string") return;

        patchFieldsInCaches(queryClient, POST_QUERY_ROOTS, id, pickFields(payload, EDITABLE_POST_FIELDS));

        // Archived / deleted posts should leave the lists, not just carry a flag: refetch what's on screen.
        const p = payload as { is_deleted?: boolean; is_archived?: boolean };
        if (p.is_deleted || p.is_archived) {
          void queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
          void queryClient.invalidateQueries({ queryKey: ["user-posts"] });
          void queryClient.invalidateQueries({ queryKey: ["page-posts"] });
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}
