// src/hooks/useProjectListPrefs.ts
//
// Per person, per project preferences for the items on Connect and Library: pin it to the top, or mute its updates
// (room meeting notifications and group chat pushes). Stored in project_list_prefs (supabase/ako_project_list_prefs.sql).
// Like pinning a chat, it only changes things for the person who set it and never touches anyone's access.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface ListPref {
  pinned: boolean;
  muted: boolean;
}

/**
 * Every pin and mute this person has set, by project id. Best effort on purpose: if the lookup fails nothing is pinned
 * or muted, so a list never goes blank because of it.
 */
export async function fetchListPrefs(userId: string): Promise<Map<string, ListPref>> {
  const { data, error } = await supabase.from("project_list_prefs").select("project_id, pinned_at, muted_at").eq("user_id", userId);
  const prefs = new Map<string, ListPref>();
  if (error) return prefs;
  for (const row of (data as { project_id: string; pinned_at: string | null; muted_at: string | null }[] | null) ?? []) {
    prefs.set(row.project_id, { pinned: !!row.pinned_at, muted: !!row.muted_at });
  }
  return prefs;
}

/** Pinned items first, otherwise the caller's own order is kept (the sort is stable). */
export function pinnedFirst<T extends { pinned: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

export function useSetListPref() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { projectId: string; pinned?: boolean; muted?: boolean }) => {
      if (!user) throw new Error("sign_in_required");
      const now = new Date().toISOString();
      // Only the columns being changed are sent, so setting one never clears the other.
      const row: Record<string, unknown> = { user_id: user.id, project_id: input.projectId, updated_at: now };
      if (input.pinned !== undefined) row.pinned_at = input.pinned ? now : null;
      if (input.muted !== undefined) row.muted_at = input.muted ? now : null;
      const { error } = await supabase.from("project_list_prefs").upsert(row, { onConflict: "user_id,project_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
