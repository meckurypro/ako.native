// src/hooks/useAffiliates.ts
//
// Affiliate forking & persistent attribution — client side. Mirrors
// the RPC surface added alongside AKO_AFFILIATE_FORKING_AND_PERSISTENT_ATTRIBUTION.md:
// manage_affiliate_program, create_affiliate_relationship,
// revoke_affiliate_relationship, track_affiliate_click,
// claim_affiliate_attribution, get_affiliate_dashboard,
// get_creator_affiliate_analytics.
//
// Nothing here computes money. Every number shown to a user (clicks,
// commission amounts, rates) is read back from the server — the
// commission math itself lives entirely in process_project_purchase()
// on the database side, same as platform_fee already did before this
// feature existed. This file only ever reads/reports.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface AffiliateProgram {
  id: string;
  project_id: string;
  creator_id: string;
  enabled: boolean;
  allow_external_promotion: boolean;
  existing_forks_survive_disable: boolean;
  created_at: string;
  updated_at: string;
}

export type AffiliateRelationshipStatus = "active" | "revoked";

export interface AffiliateRelationship {
  id: string;
  affiliate_program_id: string;
  project_id: string;
  affiliate_user_id: string;
  referral_token: string;
  status: AffiliateRelationshipStatus;
  created_at: string;
  revoked_at: string | null;
}

export interface AffiliateDashboard {
  relationship_id: string;
  referral_token: string;
  status: AffiliateRelationshipStatus;
  clicks: number;
  attributed_buyers: number;
  completed_sales: number;
  pending_commission: number;
  available_commission: number;
  paid_commission: number;
}

export interface CreatorAffiliateAnalytics {
  program_exists: boolean;
  enabled?: boolean;
  total_affiliates?: number;
  total_clicks?: number;
  attributed_buyers?: number;
  conversions?: number;
  gross_attributed_sales?: number;
  total_affiliate_commissions?: number;
}

// A relationship joined with just enough of the project to render it
// in "my affiliate links" without a separate fetch per row. Includes
// slug + owner/page username so the link itself can be the pretty
// canonical one (see getProjectUrl in src/lib/projectLinks.ts) rather
// than always falling back to the bare /projects/:id form.
export interface AffiliateRelationshipWithProject extends AffiliateRelationship {
  project: {
    id: string;
    title: string;
    thumbnail_url: string | null;
    price_usd: number;
    promo_price_usd: number | null;
    slug: string | null;
    owner: { username: string } | null;
    posted_as_page: { username: string } | null;
  } | null;
}

// Builds the shareable, ref-tagged affiliate link for a referral
// token. Takes the project's own canonical URL (see getProjectUrl in
// src/lib/projectLinks.ts) rather than building a path itself, so
// this has no idea — and doesn't need one — whether that URL is a
// pretty slug or the plain /projects/:id fallback; either way,
// attribution is resolved by project id downstream once the link is
// opened, same as it always was.
export function affiliateLinkFor(projectUrl: string, referralToken: string): string {
  const separator = projectUrl.includes("?") ? "&" : "?";
  return `${projectUrl}${separator}ref=${referralToken}`;
}

const CLICK_TOKEN_STORAGE_KEY = "ako_pending_affiliate_click_token";

// ------------------------------------------------------------
// Creator: program configuration
// ------------------------------------------------------------

// Public-ish read: any signed-in user can see a project's affiliate
// program if it's enabled (so they can decide whether to fork it);
// the creator can also see their own disabled ones. Returns null when
// no program has ever been configured for this project.
export function useAffiliateProgram(projectId: string | undefined) {
  return useQuery({
    queryKey: ["affiliate-program", projectId],
    queryFn: async (): Promise<AffiliateProgram | null> => {
      const { data, error } = await supabase
        .from("affiliate_programs")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export function useSetAffiliateProgram(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      enabled: boolean;
      commissionPct?: number; // 0–1, e.g. 0.2 for 20%. Omit to leave the rate unchanged.
      allowExternalPromotion?: boolean;
      existingForksSurviveDisable?: boolean;
    }): Promise<AffiliateProgram> => {
      const { data, error } = await supabase.rpc("manage_affiliate_program", {
        p_project_id: projectId,
        p_enabled: input.enabled,
        p_commission_pct: input.commissionPct ?? null,
        p_allow_external_promotion: input.allowExternalPromotion ?? null,
        p_existing_forks_survive_disable: input.existingForksSurviveDisable ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["affiliate-program", projectId] });
      queryClient.invalidateQueries({ queryKey: ["creator-affiliate-analytics", projectId] });
    },
  });
}

// The commission rate currently in effect for a program — versioned
// server-side (affiliate_commission_versions), so this always reads
// the latest row rather than assuming there's only ever been one.
// Used purely for display (e.g. "earn 20% on sales you bring in");
// the actual commission applied to any given sale is looked up fresh,
// server-side, at purchase time.
export function useCurrentCommissionPct(affiliateProgramId: string | undefined) {
  return useQuery({
    queryKey: ["affiliate-commission-pct", affiliateProgramId],
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from("affiliate_commission_versions")
        .select("commission_pct")
        .eq("affiliate_program_id", affiliateProgramId)
        .lte("effective_from", new Date().toISOString())
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? Number(data.commission_pct) : null;
    },
    enabled: !!affiliateProgramId,
  });
}

export function useCreatorAffiliateAnalytics(projectId: string | undefined) {
  return useQuery({
    queryKey: ["creator-affiliate-analytics", projectId],
    queryFn: async (): Promise<CreatorAffiliateAnalytics> => {
      const { data, error } = await supabase.rpc("get_creator_affiliate_analytics", {
        p_project_id: projectId,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

// ------------------------------------------------------------
// Affiliate: forking, my link, my dashboard
// ------------------------------------------------------------

// The current user's own affiliate relationship for this project, if
// they've already forked it. null if they haven't (or aren't signed in).
export function useMyAffiliateRelationship(projectId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-affiliate-relationship", projectId, user?.id],
    queryFn: async (): Promise<AffiliateRelationship | null> => {
      const { data, error } = await supabase
        .from("affiliate_relationships")
        .select("*")
        .eq("project_id", projectId)
        .eq("affiliate_user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId && !!user,
  });
}

export function useCreateAffiliateRelationship(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<AffiliateRelationship> => {
      const { data, error } = await supabase.rpc("create_affiliate_relationship", {
        p_project_id: projectId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-affiliate-relationship", projectId] });
      queryClient.invalidateQueries({ queryKey: ["my-affiliate-relationships"] });
    },
  });
}

export function useRevokeAffiliateRelationship(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (relationshipId: string): Promise<AffiliateRelationship> => {
      const { data, error } = await supabase.rpc("revoke_affiliate_relationship", {
        p_relationship_id: relationshipId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-affiliate-relationship", projectId] });
      queryClient.invalidateQueries({ queryKey: ["creator-affiliate-analytics", projectId] });
    },
  });
}

export function useAffiliateDashboard(relationshipId: string | undefined) {
  return useQuery({
    queryKey: ["affiliate-dashboard", relationshipId],
    queryFn: async (): Promise<AffiliateDashboard> => {
      const { data, error } = await supabase.rpc("get_affiliate_dashboard", {
        p_relationship_id: relationshipId,
      });
      if (error) throw error;
      return data;
    },
    enabled: !!relationshipId,
    // Clicks/sales change from actions taken elsewhere (someone else
    // clicking the link) — a short refetch window keeps the numbers
    // reasonably live without polling aggressively.
    staleTime: 15_000,
  });
}

// All of the current user's affiliate relationships, across every
// project they've forked — backs the "My affiliate links" hub.
export function useMyAffiliateRelationships() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-affiliate-relationships", user?.id],
    queryFn: async (): Promise<AffiliateRelationshipWithProject[]> => {
      const { data, error } = await supabase
        .from("affiliate_relationships")
        .select(
          "*, project:projects(id, title, thumbnail_url, price_usd, promo_price_usd, slug, owner:profiles!projects_owner_id_fkey(username), posted_as_page:pages(username))"
        )
        .eq("affiliate_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as AffiliateRelationshipWithProject[];
    },
    enabled: !!user,
  });
}

// ------------------------------------------------------------
// Click tracking + post-signup attribution claim
// ------------------------------------------------------------

export function useTrackAffiliateClick() {
  return useMutation({
    mutationFn: async (referralToken: string): Promise<{ click_token: string; project_id: string }> => {
      const { data, error } = await supabase.rpc("track_affiliate_click", {
        p_referral_token: referralToken,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useClaimAffiliateAttribution() {
  return useMutation({
    mutationFn: async (clickToken: string) => {
      const { data, error } = await supabase.rpc("claim_affiliate_attribution", {
        p_click_token: clickToken,
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Resolves a stored pending click_token into an attribution once a
 * session exists. Call this once near the root of the app (see
 * AffiliateRefCapture) — it no-ops when there's nothing pending.
 *
 * Split out from the ?ref= capture itself because the two fire at
 * different times: a click can be logged while signed out, but only
 * claimed once auth.uid() resolves to something, which may be much
 * later (a different day, after signup).
 */
export function useClaimPendingAffiliateClick() {
  const { user } = useAuth();
  const claim = useClaimAffiliateAttribution();
  const attempted = useRef(false);

  useEffect(() => {
    if (!user || attempted.current) return;
    const pending = localStorage.getItem(CLICK_TOKEN_STORAGE_KEY);
    if (!pending) return;

    attempted.current = true;
    claim.mutate(pending, {
      onSettled: () => {
        // Clear regardless of outcome — a failed claim (expired,
        // self-referral, already attributed) should never be retried
        // forever on every load.
        localStorage.removeItem(CLICK_TOKEN_STORAGE_KEY);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
}

export function storePendingAffiliateClick(clickToken: string) {
  localStorage.setItem(CLICK_TOKEN_STORAGE_KEY, clickToken);
}
