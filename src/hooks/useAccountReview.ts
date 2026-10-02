// src/hooks/useAccountReview.ts
//
// Admin side of the Incubation Account Review gate. The queue reads
// through admin_list_pending_accounts (SECURITY DEFINER — enforces
// admin-only itself, so a non-admin calling this RPC gets nothing
// rather than needing a second client-side check), and approval goes
// through admin_approve_account, which is idempotent and writes to
// the shared admin_audit_log.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface PendingAccount {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  onboarding_completed: boolean;
}

export function usePendingAccounts(search: string) {
  return useQuery({
    queryKey: ["admin-pending-accounts", search],
    queryFn: async (): Promise<PendingAccount[]> => {
      const { data, error } = await supabase.rpc("admin_list_pending_accounts", {
        p_search: search.trim() || null,
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });
}

export function useApproveAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_approve_account", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending-accounts"] });
    },
  });
}

export function useSetAccountPending() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_set_account_pending", { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending-accounts"] });
    },
  });
}
