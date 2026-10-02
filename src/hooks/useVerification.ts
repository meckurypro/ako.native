// src/hooks/useVerification.ts
//
// Admin Verified badge assignment. Individual assignment reuses the
// existing admin user search (admin-search-users, same as
// AudiencePicker's manual mode); bulk assignment reuses the existing
// notification audience taxonomy (all/tier/page_followers/manual —
// see AudienceInput in useAdminComms.ts) via a dedicated resolver
// (resolve_verified_audience_ids) so preview and execution can never
// see a different audience. All mutations go through
// admin_set_verified/admin_bulk_set_verified — SECURITY DEFINER,
// admin-only, idempotent, audited.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { AudienceInput } from "../types/audience";

export function useSetVerified() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, verified }: { userId: string; verified: boolean }) => {
      const { error } = await supabase.rpc("admin_set_verified", {
        p_user_id: userId,
        p_verified: verified,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Broad invalidation — verification can appear on any cached
      // profile/post/search result, and this is an infrequent admin
      // action, so a wide refetch is an acceptable trade for
      // correctness here.
      queryClient.invalidateQueries();
    },
  });
}

export interface VerifiedAudiencePreview {
  matched: number;
  currently_verified: number;
  will_newly_verify: number;
}

export function useVerifiedAudiencePreview(audience: AudienceInput, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-verified-audience-preview", audience],
    queryFn: async (): Promise<VerifiedAudiencePreview> => {
      const { data, error } = await supabase.rpc("admin_preview_verified_audience", {
        p_audience_type: audience.audience_type,
        p_audience_filter: audience.audience_filter,
        p_manual_ids: audience.manual_recipient_ids,
      });
      if (error) throw error;
      return data as VerifiedAudiencePreview;
    },
    enabled,
  });
}

export interface BulkVerifyResult {
  matched: number;
  already_matching: number;
  changed: number;
}

export function useBulkSetVerified() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ audience, verified }: { audience: AudienceInput; verified: boolean }): Promise<BulkVerifyResult> => {
      const { data, error } = await supabase.rpc("admin_bulk_set_verified", {
        p_audience_type: audience.audience_type,
        p_audience_filter: audience.audience_filter,
        p_manual_ids: audience.manual_recipient_ids,
        p_verified: verified,
      });
      if (error) throw error;
      return data as BulkVerifyResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}
