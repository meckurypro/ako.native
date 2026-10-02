// src/hooks/useProjectMembers.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface ProjectMember {
  user_id: string;
  added_at: string;
  profile: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

// Owner-facing member list for a private project — used by
// ManageAccessSheet. RLS should restrict this to the project's own
// owner (see the project_members policies in the migration); nobody
// else can list a private project's members this way.
export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async (): Promise<ProjectMember[]> => {
      const { data, error } = await supabase
        .from("project_members")
        .select("user_id, added_at, profile:profiles!project_members_user_id_fkey(id, username, display_name, avatar_url)")
        .eq("project_id", projectId)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProjectMember[];
    },
    enabled: !!projectId,
  });
}

// Membership check for the current viewer — this is the actual access
// gate ProjectCard reads. Skipped entirely for a non-private project
// (nothing to check) and returns true without a query for the owner.
export function useIsProjectMember(projectId: string, isPrivate: boolean) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-project-member", projectId, user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("project_members")
        .select("user_id")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    // Only worth asking when the project is actually private — for a
    // public project everyone is implicitly "a member" as far as
    // ProjectCard's gating logic cares.
    enabled: !!user && !!projectId && isPrivate,
  });
}

export function useAddProjectMember(projectId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("project_members")
        .insert({ project_id: projectId, user_id: targetUserId, added_by: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      queryClient.invalidateQueries({ queryKey: ["is-project-member", projectId] });
    },
  });
}

export function useRemoveProjectMember(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", targetUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      queryClient.invalidateQueries({ queryKey: ["is-project-member", projectId] });
    },
  });
}
