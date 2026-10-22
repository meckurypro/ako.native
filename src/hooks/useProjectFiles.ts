// src/hooks/useProjectFiles.ts
//
// A File project can hold several files (project_files). Reading is a plain query — anyone who can see the project
// can see its file list (names and sizes; the files themselves only ever come from get-project-file, which checks
// purchase/ownership). Writing is ONE database function, set_project_files, which replaces the whole list in order,
// enforces the limit (1, or 6 for verified accounts) and tells us which storage objects nothing uses any more.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../lib/supabase";

export interface ProjectFile {
  id: string;
  project_id: string;
  position: number;
  file_path: string;
  /** The uploaded file's own name, with extension. */
  original_name: string;
  /** What the creator typed for this slot, if anything (no extension). */
  display_name: string | null;
  /** What the saved copy is called: display_name if set, else the uploaded file's name — always with extension. */
  download_name: string;
  size_bytes: number | null;
  created_at: string;
}

export interface ProjectFileInput {
  /** Existing file's id to keep it; omit for a newly uploaded one. */
  id?: string | null;
  file_path: string;
  original_name: string;
  display_name?: string | null;
  size_bytes?: number | null;
}

export function useProjectFiles(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["project-files", projectId],
    enabled: !!projectId && enabled,
    queryFn: async (): Promise<ProjectFile[]> => {
      const { data, error } = await supabase
        .from("project_files")
        .select("*")
        .eq("project_id", projectId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectFile[];
    },
  });
}

/**
 * Replaces a project's file list. Storage objects nothing references any more are removed best-effort (a failure
 * leaves an orphan in the bucket, never a broken project).
 */
export async function saveProjectFiles(projectId: string, files: ProjectFileInput[]): Promise<void> {
  const { data, error } = await supabase.rpc("set_project_files", {
    p_project_id: projectId,
    p_files: files.map((f) => ({
      id: f.id ?? null,
      file_path: f.file_path,
      original_name: f.original_name,
      display_name: f.display_name?.trim() || null,
      size_bytes: f.size_bytes ?? null,
    })),
  });
  if (error) throw error;
  const removed = ((data as { removed_paths?: string[] } | null)?.removed_paths ?? []).filter(Boolean);
  if (removed.length > 0) {
    const { error: removeError } = await supabase.storage.from("private-content").remove(removed);
    if (removeError) console.warn("Couldn't remove replaced project files from storage:", removeError);
  }
}

export function useSaveProjectFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, files }: { projectId: string; files: ProjectFileInput[] }) =>
      saveProjectFiles(projectId, files),
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["project-files", vars.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["project", vars.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["project-detail", vars.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["user-projects"] });
      void queryClient.invalidateQueries({ queryKey: ["page-projects"] });
    },
  });
}
