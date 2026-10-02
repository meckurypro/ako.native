// src/hooks/useWalletRates.ts
//
// Reads the admin-controlled exchange_rates table directly — RLS
// allows any authenticated user to SELECT (rates aren't sensitive),
// but only admins can UPDATE (see the exchange_rates RLS policies
// in the wallet migration). Writing a new rate happens in
// useAdminWallet.ts, gated by the same admin_roles-based policy.
//
// These are DISPLAY-ONLY previews. The actual amount charged/paid
// out is always recomputed server-side (convert_currency()) inside
// initiate-deposit / process-withdrawal at the moment of the real
// transaction — never trust a rate the client fetched a few
// seconds ago for the real charge.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface ExchangeRates {
  deposit: number;
  withdrawal: number;
}

export function useExchangeRates() {
  return useQuery({
    queryKey: ["exchange-rates"],
    queryFn: async (): Promise<ExchangeRates> => {
      const { data, error } = await supabase.from("exchange_rates").select("kind, rate");
      if (error) throw error;

      const rates: ExchangeRates = { deposit: 0, withdrawal: 0 };
      for (const row of data ?? []) {
        if (row.kind === "deposit") rates.deposit = Number(row.rate);
        if (row.kind === "withdrawal") rates.withdrawal = Number(row.rate);
      }
      return rates;
    },
    staleTime: 60 * 1000,
  });
}

export interface WithdrawalEligibility {
  wallet_balance: number;
  cap_usd: number;
  already_committed_usd: number;
  available_to_request: number;
  cycle_start: string;
}

/**
 * Live preview of the 50% weekly cap, via the same
 * get_withdrawal_eligibility() RPC process-withdrawal enforces
 * server-side — so this can never show the user a number the
 * server would then reject.
 */
export function useWithdrawalEligibility() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["withdrawal-eligibility", user?.id],
    queryFn: async (): Promise<WithdrawalEligibility> => {
      const { data, error } = await supabase
        .rpc("get_withdrawal_eligibility", { p_user_id: user!.id })
        .single();
      if (error) throw error;
      return data as unknown as WithdrawalEligibility;
    },
    enabled: !!user,
  });
}

/** Today's weekday in the business timezone — Friday opens requests, Saturday runs the batch. */
export function useBusinessWeekday(): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", weekday: "long" }).format(new Date());
}

/**
 * Live preview of Paystack's transfer fee + stamp duty for a given
 * gross NGN amount, via the same calculate_transfer_fee_ngn() that
 * request_withdrawal() uses server-side — so this can never show a
 * fee the server would then charge differently. Debounces on the
 * rounded amount so it doesn't fire on every keystroke.
 */
export function useTransferFeePreview(grossNgn: number | null) {
  const rounded = grossNgn && grossNgn > 0 ? Math.round(grossNgn) : null;

  return useQuery({
    queryKey: ["transfer-fee-preview", rounded],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("calculate_transfer_fee_ngn", {
        p_amount_ngn: rounded,
      });
      if (error) throw error;
      return Number(data);
    },
    enabled: rounded !== null,
    staleTime: 60 * 1000,
  });
}

export interface PayoutSettings {
  minimumWithdrawalUsd: number;
  newAccountCooldownHours: number;
}

// Falls back to the same numbers request_withdrawal() defaults to, so a
// slow/failed fetch degrades to the correct values rather than 0s —
// but this is still just for display copy; the server (payout_settings,
// read live inside request_withdrawal()) is what actually enforces them.
const PAYOUT_SETTINGS_FALLBACK: PayoutSettings = {
  minimumWithdrawalUsd: 10,
  newAccountCooldownHours: 24,
};

/**
 * Reads the admin-controlled payout_settings singleton row directly —
 * RLS allows any authenticated user to SELECT it. This replaces what
 * used to be a hardcoded `$10` constant duplicated in this file and in
 * the process-withdrawal edge function; now there's exactly one place
 * (the payout_settings table) either side can drift out of sync with.
 */
export function usePayoutSettings() {
  return useQuery({
    queryKey: ["payout-settings"],
    queryFn: async (): Promise<PayoutSettings> => {
      const { data, error } = await supabase
        .from("payout_settings")
        .select("minimum_withdrawal_usd, new_account_cooldown_hours")
        .single();
      if (error) throw error;
      return {
        minimumWithdrawalUsd: Number(data.minimum_withdrawal_usd),
        newAccountCooldownHours: Number(data.new_account_cooldown_hours),
      };
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: PAYOUT_SETTINGS_FALLBACK,
  });
}
