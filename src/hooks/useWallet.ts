// src/hooks/useWallet.ts
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { GiftType, Wallet } from "../types/database";

export function useWallet() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["wallet", user?.id],
    queryFn: async (): Promise<Wallet> => {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

async function fetchGiftTypes(): Promise<GiftType[]> {
  const { data, error } = await supabase.from("gift_types").select("*").eq("is_active", true).order("sort_order");
  if (error) throw error;
  return data;
}

const GIFT_TYPES_STALE_MS = 5 * 60 * 1000;

export function useGiftTypes() {
  return useQuery({
    queryKey: ["gift-types"],
    queryFn: fetchGiftTypes,
    staleTime: GIFT_TYPES_STALE_MS,
  });
}

// The current user's most-frequently-sent gift types, most-used first.
// Backs GiftPicker's "top six used collect the top two rows" behavior —
// derived client-side from the `gifts` table (sender_id, gift_type_id)
// rather than a dedicated aggregate table, since gift-sending volume per
// user is low enough that this is cheap and always accurate.
async function fetchTopGiftTypeIds(userId: string, limit: number): Promise<string[]> {
  const { data, error } = await supabase.from("gifts").select("gift_type_id").eq("sender_id", userId);
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data) {
    counts.set(row.gift_type_id, (counts.get(row.gift_type_id) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

export function useTopGiftTypeIds(limit = 6) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["top-gift-types", user?.id],
    queryFn: () => fetchTopGiftTypeIds(user!.id, limit),
    enabled: !!user,
    staleTime: 60 * 1000,
  });
}

/**
 * Warms the gift catalogue (and the user's most-used gifts) as soon as someone is signed in, so the picker opens at its
 * full size with the gifts already in it the very first time — instead of opening as a small "Loading gifts…" card that
 * then grows.
 */
export function usePrefetchGifting() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    void queryClient.prefetchQuery({ queryKey: ["gift-types"], queryFn: fetchGiftTypes, staleTime: GIFT_TYPES_STALE_MS });
    void queryClient.prefetchQuery({ queryKey: ["top-gift-types", userId], queryFn: () => fetchTopGiftTypeIds(userId, 6), staleTime: 60 * 1000 });
    void queryClient.prefetchQuery({
      queryKey: ["wallet", userId],
      queryFn: async (): Promise<Wallet> => {
        const { data, error } = await supabase.from("wallets").select("*").eq("user_id", userId).single();
        if (error) throw error;
        return data;
      },
    });
  }, [queryClient, userId]);
}

export function useWalletTransactions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["wallet-transactions", user?.id],
    queryFn: async () => {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("id")
        .eq("user_id", user!.id)
        .single();

      if (!wallet) return [];

      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("wallet_id", wallet.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}
