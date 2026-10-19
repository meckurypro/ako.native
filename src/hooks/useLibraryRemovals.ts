// src/hooks/useLibraryRemovals.ts
//
// "Remove from my Library / Connect". Everything a person has access to (a purchase, a ticket, a free open) is
// listed on those pages automatically; this is the opt-out. A removal only hides the project from the lists —
// access itself is untouched, and because it is stored per user it holds across devices and re-opens.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * The project ids this user removed from their Library/Connect lists. Best effort on purpose: if the lookup fails
 * (offline, transient error) nothing is treated as removed, so the page never goes blank because of it.
 */
export async function fetchRemovedProjectIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("project_library_removals").select("project_id").eq("user_id", userId);
  if (error) return new Set();
  return new Set(((data as { project_id: string }[] | null) ?? []).map((r) => r.project_id));
}

export function useRemoveFromLibrary() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      if (!user) throw new Error("sign_in_required");
      const { error } = await supabase
        .from("project_library_removals")
        .upsert({ user_id: user.id, project_id: projectId }, { onConflict: "user_id,project_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
