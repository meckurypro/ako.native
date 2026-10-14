import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { isProjectFree, type Project } from "./useProjects";

// Reads the public, non-identifying count from the project_access_counts
// view (see ako_projects_v2_rls.sql) — safe to show on ProjectCard and
// ProjectDetail regardless of who's viewing. Returns 0 rather than null
// for a project with no access yet (the view simply has no row for it).
export function useProjectAccessCount(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-access-count", projectId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("project_access_counts")
        .select("access_count")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data?.access_count ?? 0;
    },
    enabled: !!projectId,
  });
}

// Logs a FREE access event (stream/download/link_click) directly from
// the client. Paid access is logged separately by the purchase-project
// edge function itself (via the service role) — do not call this hook
// after a paid unlock, or the access would be double-counted.
export function useLogFreeProjectAccess() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      projectId,
      accessType,
    }: {
      projectId: string;
      accessType: "download" | "stream" | "link_click";
    }) => {
      if (!user) return; // anonymous viewers aren't counted — access_events requires a user_id
      const { error } = await supabase.from("project_access_events").insert({
        project_id: projectId,
        user_id: user.id,
        access_type: accessType,
        amount_paid: 0,
      });
      if (error) throw error;
    },
  });
}

// Library only lists these types (see useLibrary's LIBRARY_TYPES) — events,
// meetings, rooms and gigs live in Activity / their own pages instead.
const OPEN_LIBRARY_TYPES = new Set(["book", "course", "media", "file", "url"]);

// Module-level so a project opened again (or from two pages, e.g. Book →
// BookReader) in the same session doesn't re-check or re-insert.
const recordedOpens = new Set<string>();

/**
 * Opening a FREE book/course/media/file/link is "access" too — it belongs in
 * the viewer's Library (see useLibrary), not only the actions inside a
 * ProjectCard (stream/download/link click). Previously nothing was logged
 * when someone simply opened a project's page, a book or a course, so those
 * never reached Library.
 *
 * Logs at most ONE event per user + project (checked against existing rows
 * first) so project_access_counts stays "people who accessed it" rather than
 * "page views". Paid projects are skipped — purchase-project logs those
 * server-side — as are the owner's own projects, drafts/archived ones, and
 * anything the viewer can't actually access (pass `enabled={false}`).
 * Best-effort: a failure here never surfaces to the user.
 */
export function useRecordFreeProjectOpen(
  project: Pick<Project, "id" | "project_type" | "price_usd" | "promo_price_usd" | "status"> | null | undefined,
  { isOwner = false, enabled = true }: { isOwner?: boolean; enabled?: boolean } = {}
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const projectId = project?.id;
  const eligible =
    !!user &&
    !!project &&
    enabled &&
    !isOwner &&
    project.status === "active" &&
    OPEN_LIBRARY_TYPES.has(project.project_type) &&
    isProjectFree(project);
  const accessType = project?.project_type === "url" ? "link_click" : "stream";

  useEffect(() => {
    if (!eligible || !user || !projectId) return;
    const key = `${user.id}:${projectId}`;
    if (recordedOpens.has(key)) return;
    recordedOpens.add(key);

    (async () => {
      try {
        const { data: existing, error: readError } = await supabase
          .from("project_access_events")
          .select("project_id")
          .eq("project_id", projectId)
          .eq("user_id", user.id)
          .limit(1);
        if (readError) throw readError;
        if (existing && existing.length > 0) return; // already in Library

        const { error } = await supabase.from("project_access_events").insert({
          project_id: projectId,
          user_id: user.id,
          access_type: accessType,
          amount_paid: 0,
        });
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["library", user.id] });
        queryClient.invalidateQueries({ queryKey: ["project-access-count", projectId] });
      } catch {
        // Let a later open retry.
        recordedOpens.delete(key);
      }
    })();
  }, [eligible, user, projectId, accessType, queryClient]);
}
