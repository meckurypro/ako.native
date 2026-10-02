import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { Project } from "./useProjects";

export function useIsProjectSaved(projectId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-project-saved", projectId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("saved_projects")
        .select("project_id")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });
}

export function useToggleSavedProject(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (currentlySaved: boolean) => {
      if (!user) throw new Error("Not signed in");

      if (currentlySaved) {
        const { error } = await supabase
          .from("saved_projects")
          .delete()
          .eq("project_id", projectId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("saved_projects")
          .insert({ project_id: projectId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["is-project-saved", projectId] });
      queryClient.invalidateQueries({ queryKey: ["saved-projects"] });
    },
  });
}

// Used by the profile "Saved" view (same pattern as useBookmarkedPosts).
export function useSavedProjects() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["saved-projects", user?.id],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from("saved_projects")
        .select(`project:projects!saved_projects_project_id_fkey(*)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => row.project).filter(Boolean);
    },
    enabled: !!user,
  });
}
