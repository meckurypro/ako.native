// src/hooks/useMarkProjectSeen.ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * Records that the current user has seen this project — powers the
 * Activity hub's "History" tab (see useViewHistory.ts). Same pattern
 * as useMarkPostSeen for posts, backed by public.project_views
 * (mirrors post_views exactly — see the migration SQL). No-ops if the
 * viewer is the project's own owner.
 *
 * Upserts on (user_id, project_id) so a re-view bumps viewed_at,
 * giving most-recently-viewed order in History rather than
 * first-ever-viewed order.
 */
export function useMarkProjectSeen(projectId: string, ownerId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!projectId || !user || !ownerId) return;
    if (user.id === ownerId) return; // don't track owners viewing their own project

    let cancelled = false;

    (async () => {
      try {
        const { error } = await supabase
          .from("project_views")
          .upsert(
            { user_id: user.id, project_id: projectId, viewed_at: new Date().toISOString() },
            { onConflict: "user_id,project_id" }
          );
        if (cancelled) return;

        if (error && error.code !== "409") {
          console.error("Failed to mark project as seen:", error);
          return;
        }

        queryClient.invalidateQueries({ queryKey: ["view-history"] });
      } catch (err) {
        console.error("Failed to mark project as seen:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, user, ownerId, queryClient]);
}
