// src/hooks/useOffers.ts
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useSound } from "./useSound";
import type { ProjectType } from "./useProjects";

// ------------------------------------------------------------
// Offers — a creator bundles 2+ of their own paid projects at one
// price (max MAX_OFFERS each). Buying an offer unlocks every project
// in it. All rules live in supabase/ako_offers.sql; this file only
// calls the RPCs defined there.
// ------------------------------------------------------------

export const MAX_OFFERS = 10;

// Mirrors offer_eligible_project_types() in ako_offers.sql. Events and
// rooms are excluded on purpose (their purchase issues tickets / room
// membership), talents are booked rather than unlocked, pitches have no price.
export const OFFER_ELIGIBLE_TYPES: ProjectType[] = ["book", "course", "media", "file", "url", "meeting"];

export interface OfferItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  project_type: ProjectType;
  // Effective price (promo wins over list price), same definition as a normal purchase.
  price_usd: number;
  available: boolean;
}

export interface Offer {
  id: string;
  owner_id: string;
  price_usd: number;
  // Sum of the items' own prices — what buying them one by one would cost.
  sum_usd: number;
  savings_usd: number;
  savings_pct: number;
  items: OfferItem[];
  // false when a project was archived/made private/made free, or a price
  // change means the offer no longer undercuts buying separately.
  is_valid: boolean;
  problem: "unavailable" | "not_discounted" | null;
  created_at: string;
  updated_at: string;
}

function rpcError(error: { message: string }): Error {
  return new Error(error.message);
}

// ---------- creator ----------

export function useMyOffers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-offers", user?.id],
    queryFn: async (): Promise<Offer[]> => {
      const { data, error } = await supabase.rpc("get_my_offers");
      if (error) throw rpcError(error);
      return (data ?? []) as Offer[];
    },
    enabled: !!user,
  });
}

export interface OfferableProject {
  id: string;
  title: string;
  thumbnail_url: string | null;
  project_type: ProjectType;
  price_usd: number;
  promo_price_usd: number | null;
}

// The creator's own projects that can go into an offer: published, public, paid.
export function useOfferableProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["offerable-projects", user?.id],
    queryFn: async (): Promise<OfferableProject[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, title, thumbnail_url, project_type, price_usd, promo_price_usd, published_at")
        .eq("owner_id", user!.id)
        .eq("is_active", true)
        .eq("status", "active")
        .eq("is_private", false)
        .in("project_type", OFFER_ELIGIBLE_TYPES)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as (OfferableProject & { published_at: string | null })[])
        .filter((p) => (p.promo_price_usd ?? p.price_usd) > 0)
        .filter((p) => p.project_type !== "course" || !!p.published_at)
        .map(({ published_at: _published, ...p }) => p);
    },
    enabled: !!user,
  });
}

function invalidateOfferCaches(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["my-offers"] });
  void queryClient.invalidateQueries({ queryKey: ["project-offers"] });
}

export function useCreateOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ priceUsd, projectIds }: { priceUsd: number; projectIds: string[] }): Promise<Offer> => {
      const { data, error } = await supabase.rpc("create_offer", { p_price: priceUsd, p_project_ids: projectIds });
      if (error) throw rpcError(error);
      return data as Offer;
    },
    onSuccess: () => invalidateOfferCaches(queryClient),
  });
}

export function useUpdateOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      offerId,
      priceUsd,
      projectIds,
    }: {
      offerId: string;
      priceUsd: number;
      projectIds: string[];
    }): Promise<Offer> => {
      const { data, error } = await supabase.rpc("update_offer", {
        p_offer_id: offerId,
        p_price: priceUsd,
        p_project_ids: projectIds,
      });
      if (error) throw rpcError(error);
      return data as Offer;
    },
    onSuccess: () => invalidateOfferCaches(queryClient),
  });
}

export function useDeleteOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await supabase.rpc("delete_offer", { p_offer_id: offerId });
      if (error) throw rpcError(error);
    },
    onSuccess: () => invalidateOfferCaches(queryClient),
  });
}

// ---------- buyer ----------

async function fetchProjectOffers(projectId: string): Promise<Offer[]> {
  const { data, error } = await supabase.rpc("get_project_offers", { p_project_id: projectId });
  if (error) throw rpcError(error);
  return (data ?? []) as Offer[];
}

// Checked at the moment a viewer taps "Buy" — not on render, so a feed of paid
// project cards doesn't fire one request each. Offers worth suggesting are
// valid, from another creator, and contain none of the projects the buyer
// already owns; best saving first, at most 3 (see get_project_offers in
// ako_offers.sql).
//
// Usage:
//   const nudge = useOfferNudge(project.id);
//   async function handleBuy() {
//     if (await nudge.offerBeforeBuy()) return;   // sheet opened instead
//     await buyThisProjectOnly();
//   }
//   {nudge.offers && <OfferNudgeSheet offers={nudge.offers} onClose={nudge.close} … />}
//
// A failure to look offers up never blocks buying: it just resolves false.
export function useOfferNudge(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [checking, setChecking] = useState(false);

  async function offerBeforeBuy(): Promise<boolean> {
    if (!user) return false;
    setChecking(true);
    try {
      const found = await queryClient.fetchQuery({
        queryKey: ["project-offers", projectId, user.id],
        queryFn: () => fetchProjectOffers(projectId),
        staleTime: 30_000,
      });
      if (found.length === 0) return false;
      setOffers(found);
      return true;
    } catch {
      return false;
    } finally {
      setChecking(false);
    }
  }

  return { offers, checking, offerBeforeBuy, close: () => setOffers(null) };
}

// ---------- purchase ----------

export function usePurchaseOffer() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { play } = useSound();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (offerId: string) => {
      const { data, error } = await supabase.rpc("process_offer_purchase", {
        p_buyer_id: user!.id,
        p_offer_id: offerId,
      });
      if (error) throw rpcError(error);
      return data as { offer_id: string; total_usd: number; purchases: { project_id: string }[] };
    },
    onSuccess: () => {
      // Every project in the offer just unlocked, so refresh them all.
      void queryClient.invalidateQueries({ queryKey: ["has-purchased"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["project-offers"] });
      void queryClient.invalidateQueries({ queryKey: ["library"] });
      void queryClient.invalidateQueries({ queryKey: ["project-access-count"] });
      play("unlock-success");
    },
  });
}
