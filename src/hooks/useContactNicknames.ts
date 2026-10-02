// src/hooks/useContactNicknames.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

/**
 * A private label the signed-in user has set for someone else's
 * profile — visible only to them (see contact_nicknames.sql). Used to
 * override the displayed name for that contact wherever it's read,
 * without ever touching the contact's own profile row.
 */
export function useContactNickname(contactId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["contact-nickname", contactId, user?.id],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("contact_nicknames")
        .select("nickname")
        .eq("owner_id", user!.id)
        .eq("contact_id", contactId)
        .maybeSingle();
      if (error) throw error;
      return data?.nickname ?? null;
    },
    enabled: !!user && !!contactId && user.id !== contactId,
  });
}

export function useSetContactNickname(contactId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (nickname: string) => {
      if (!user) throw new Error("Not signed in");
      const trimmed = nickname.trim();

      if (!trimmed) {
        // Empty input clears it — same button either sets or removes,
        // rather than needing a separate "reset" affordance.
        const { error } = await supabase
          .from("contact_nicknames")
          .delete()
          .eq("owner_id", user.id)
          .eq("contact_id", contactId);
        if (error) throw error;
        return null;
      }

      const { error } = await supabase
        .from("contact_nicknames")
        .upsert(
          { owner_id: user.id, contact_id: contactId, nickname: trimmed, updated_at: new Date().toISOString() },
          { onConflict: "owner_id,contact_id" }
        );
      if (error) throw error;
      return trimmed;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-nickname", contactId] });
    },
  });
}
