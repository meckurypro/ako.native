import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

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
