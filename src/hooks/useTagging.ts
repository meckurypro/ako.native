// src/hooks/useTagging.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export type TagTarget = "post" | "project";

export interface TaggedUser {
  user_id: string;
  created_at: string;
  user: { id: string; username: string; display_name: string; avatar_url: string | null };
}

function tableFor(target: TagTarget) {
  return target === "post" ? "post_tags" : "project_tags";
}
function idColumnFor(target: TagTarget) {
  return target === "post" ? "post_id" : "project_id";
}

/** Everyone tagged on a given post or project. */
export function useTaggedUsers(target: TagTarget, targetId: string | undefined) {
  return useQuery({
    queryKey: ["tagged-users", target, targetId],
    queryFn: async (): Promise<TaggedUser[]> => {
      if (!targetId) return [];
      const { data, error } = await supabase
        .from(tableFor(target))
        .select(`user_id, created_at, user:profiles!${tableFor(target)}_user_id_fkey(id, username, display_name, avatar_url)`)
        .eq(idColumnFor(target), targetId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as TaggedUser[];
    },
    enabled: !!targetId,
  });
}

/**
 * Replaces the full tag list for a post/project in one call — the tag
 * picker collects a set of user ids while composing, then this diffs
 * it against whatever's already tagged (add the new ones, drop the
 * ones the user un-picked) rather than requiring one insert per tap.
 * A DB trigger notifies each newly-tagged user.
 */
export function useSetTaggedUsers(target: TagTarget) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const table = tableFor(target);
  const idColumn = idColumnFor(target);

  return useMutation({
    mutationFn: async ({ targetId, userIds }: { targetId: string; userIds: string[] }) => {
      if (!user) throw new Error("Not signed in.");

      const { data: existing, error: fetchError } = await supabase
        .from(table)
        .select("user_id")
        .eq(idColumn, targetId);
      if (fetchError) throw fetchError;

      const existingIds = new Set((existing ?? []).map((r: any) => r.user_id as string));
      const nextIds = new Set(userIds);

      const toAdd = userIds.filter((id) => !existingIds.has(id));
      const toRemove = [...existingIds].filter((id) => !nextIds.has(id));

      if (toAdd.length > 0) {
        const { error } = await supabase.from(table).insert(
          toAdd.map((userId) => ({ [idColumn]: targetId, user_id: userId, tagged_by: user.id }))
        );
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase.from(table).delete().eq(idColumn, targetId).in("user_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: (_data, { targetId }) => {
      queryClient.invalidateQueries({ queryKey: ["tagged-users", target, targetId] });
    },
  });
}
