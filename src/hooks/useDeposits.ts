// src/hooks/useDeposits.ts
//
// Paystack NGN -> USD wallet deposits. Replaces the old IAP path —
// see FundWallet.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

interface InitiateDepositResult {
  deposit_id: string;
  authorization_url: string;
  reference: string;
  amount_usd: number;
  amount_ngn: number;
  exchange_rate: number;
}

/**
 * Calls initiate-deposit, which creates a 'pending' deposits row
 * and starts a Paystack Standard Checkout transaction. On success,
 * redirect the browser to authorization_url — Paystack handles the
 * actual card/bank-transfer UI, then redirects back to
 * /wallet/deposit/callback.
 */
export function useInitiateDeposit() {
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (amount_usd: number): Promise<InitiateDepositResult> => {
      const { data, error } = await supabase.functions.invoke("initiate-deposit", {
        body: { amount_usd },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });
}

export type DepositVerifyStatus = "success" | "failed" | "pending";

/**
 * Called from DepositCallback.tsx after Paystack redirects back.
 * This is the user-facing fallback verification — the
 * paystack-charge-webhook is the authoritative path and often
 * lands first. Both are idempotent against the same deposit row,
 * so calling this never risks a double credit.
 */
export function useVerifyDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reference: string): Promise<{ status: DepositVerifyStatus; amount_usd?: number }> => {
      const { data, error } = await supabase.functions.invoke("verify-deposit", {
        body: { reference },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
    },
  });
}

export interface Deposit {
  id: string;
  amount_usd: number;
  amount_ngn: number;
  status: "pending" | "success" | "failed";
  created_at: string;
}

export function useDeposits() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["deposits", user?.id],
    queryFn: async (): Promise<Deposit[]> => {
      const { data, error } = await supabase
        .from("deposits")
        .select("id, amount_usd, amount_ngn, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}
