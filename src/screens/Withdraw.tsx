// src/screens/Withdraw.tsx
//
// Withdraw (native). Port of the web Withdraw page: pick (or add) a verified bank account, enter a USD
// amount, see the naira you'll receive after Paystack's fee, and submit.
//
// Rules live on the server (process-withdrawal / request_withdrawal): requests are accepted on Fridays
// only (Africa/Lagos), capped at 50% of the balance per week, and paid out in Saturday's batch. The checks
// here are only so people don't wait for a round trip to learn they can't do it.
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { CalendarClock, Check, Landmark, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Icon, Text, useToast } from "@/components/ui";
import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SelectField } from "@/components/ui/SelectField";
import { Skeleton } from "@/components/ui/Skeleton";
import { SurfaceInput } from "@/components/ui/SurfaceInput";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useAddPayoutAccount, usePayoutAccounts, useWithdraw, useWithdrawals } from "@/hooks/usePayout";
import { useWallet } from "@/hooks/useWallet";
import {
  useBusinessWeekday,
  useExchangeRates,
  usePayoutSettings,
  useTransferFeePreview,
  useWithdrawalEligibility,
} from "@/hooks/useWalletRates";
import { resolveFunctionErrorMessage } from "@/lib/functionErrors";
import { formatNgn, formatUsd } from "@/lib/money";
import { supabase } from "@/lib/supabase";

/** Live bank list from Paystack via list-banks. Cached for the session — bank lists change rarely. */
function useBankList() {
  return useQuery({
    queryKey: ["bank-list"],
    queryFn: async (): Promise<{ name: string; code: string }[]> => {
      const { data, error } = await supabase.functions.invoke("list-banks");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.banks;
    },
    staleTime: 60 * 60 * 1000,
  });
}

/** Debounced account-name lookup once a full 10-digit number is typed (resolve-bank-account has no side effects). */
function useResolvedAccountName(bankCode: string, accountNumber: string) {
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    setResolvedName(null);
    setResolveError(null);
    if (accountNumber.length !== 10 || !bankCode) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setResolving(true);
      const { data, error } = await supabase.functions.invoke("resolve-bank-account", {
        body: { account_number: accountNumber, bank_code: bankCode },
      });
      if (cancelled) return;
      setResolving(false);
      if (error || data?.error) {
        setResolveError("Couldn't verify this account.");
        return;
      }
      setResolvedName(data.account_name);
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [bankCode, accountNumber]);

  return { resolvedName, resolving, resolveError };
}

/** Next Friday in the business timezone, for the "opens on…" note. Display only. */
function nextFridayLabel(): string {
  const lagosNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  const daysUntilFriday = (5 - lagosNow.getDay() + 7) % 7 || 7;
  const next = new Date(lagosNow);
  next.setDate(lagosNow.getDate() + daysUntilFriday);
  return next.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

const STATUS_STYLES: Record<string, { box: string; text: string }> = {
  pending: { box: "bg-canvas border border-border", text: "text-ink-muted" },
  processing: { box: "bg-accent-soft", text: "text-accent" },
  completed: { box: "bg-accent-soft", text: "text-accent" },
  failed: { box: "bg-danger/10", text: "text-danger" },
  reversed: { box: "bg-danger/10", text: "text-danger" },
};

const AMOUNT_RE = /^\d*\.?\d{0,2}$/;

export default function Withdraw() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const withdrawalsEnabled = useFeatureFlag("withdrawals_enabled");

  const { data: wallet, isLoading: walletLoading } = useWallet();
  const { data: payoutAccounts, isLoading: accountsLoading } = usePayoutAccounts();
  const { data: withdrawals } = useWithdrawals();
  const { data: banks, isLoading: banksLoading } = useBankList();
  const { data: rates } = useExchangeRates();
  const { data: eligibility } = useWithdrawalEligibility();
  const { data: payoutSettings } = usePayoutSettings();
  const weekday = useBusinessWeekday();
  const addAccount = useAddPayoutAccount();
  const withdraw = useWithdraw();

  const minimumWithdrawalUsd = payoutSettings?.minimumWithdrawalUsd ?? 10;
  const isWithdrawalDay = weekday === "Friday";

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const { resolvedName, resolving, resolveError } = useResolvedAccountName(bankCode, accountNumber);

  const activeAccounts = (payoutAccounts ?? []).filter((a) => a.is_verified);

  // One verified account → select it for them.
  useEffect(() => {
    if (!selectedAccountId && activeAccounts.length === 1) setSelectedAccountId(activeAccounts[0].id);
  }, [activeAccounts, selectedAccountId]);

  const amountUsd = parseFloat(amount) || 0;
  const grossNgn = rates?.withdrawal && amountUsd ? amountUsd * rates.withdrawal : null;
  const { data: feeNgn } = useTransferFeePreview(grossNgn);
  const netNgn = grossNgn !== null && feeNgn !== undefined ? grossNgn - feeNgn : null;
  const availableToRequest = eligibility?.available_to_request ?? null;

  async function handleAddAccount() {
    setAddAccountError(null);
    const bank = banks?.find((b) => b.code === bankCode);
    if (!bank) {
      setAddAccountError("Choose a bank.");
      return;
    }
    if (!resolvedName) {
      setAddAccountError("Enter a valid account number first — we'll confirm the name.");
      return;
    }
    try {
      await addAccount.mutateAsync({ account_number: accountNumber, bank_code: bankCode, bank_name: bank.name });
      setShowAddAccount(false);
      setAccountNumber("");
      toast("Payout account added.", { variant: "success" });
    } catch (err) {
      setAddAccountError(await resolveFunctionErrorMessage(err, "Couldn't add this account."));
    }
  }

  async function handleWithdraw() {
    setError(null);
    if (!selectedAccountId) {
      setError("Choose a bank account first.");
      return;
    }
    if (!amountUsd || amountUsd < minimumWithdrawalUsd) {
      setError(`Minimum withdrawal is ${formatUsd(minimumWithdrawalUsd)}.`);
      return;
    }
    if (wallet && amountUsd > Number(wallet.balance)) {
      setError("That's more than your available balance.");
      return;
    }
    if (availableToRequest !== null && amountUsd > availableToRequest) {
      setError(`You can request up to ${formatUsd(availableToRequest)} this week (max 50% of your balance).`);
      return;
    }
    try {
      await withdraw.mutateAsync({ amount_usd: amountUsd, payout_account_id: selectedAccountId });
      setAmount("");
      toast("Withdrawal requested.", { variant: "success" });
      router.replace("/wallet");
    } catch (err) {
      setError(await resolveFunctionErrorMessage(err, "Withdrawal failed."));
    }
  }

  const bankOptions = (banks ?? []).map((b) => ({ value: b.code, label: b.name }));

  return (
    <KeyboardAvoider className="flex-1 bg-canvas">
      <ScreenHeader title="Withdraw" bar />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: insets.bottom + 32 }}
      >
        {/* Balance */}
        <View className="mb-5 rounded-2xl border border-border bg-surface p-4">
          <Text className="text-[11px] uppercase tracking-wide text-ink-muted">Available balance</Text>
          {walletLoading ? (
            <Skeleton className="mt-1 h-8 w-32 rounded-lg" />
          ) : (
            <Text className="mt-0.5 font-display text-3xl text-ink">{formatUsd(wallet?.balance ?? 0)}</Text>
          )}
          {withdrawalsEnabled && availableToRequest !== null ? (
            <Text className="mt-1 text-xs text-ink-muted">
              Up to {formatUsd(availableToRequest)} can be requested this week (50% weekly limit).
            </Text>
          ) : null}
        </View>

        {!withdrawalsEnabled ? (
          <View className="mb-6 rounded-xl bg-danger/10 p-3">
            <Text className="text-sm text-danger">Withdrawals are temporarily unavailable. Check back later.</Text>
          </View>
        ) : (
          <>
            {!isWithdrawalDay ? (
              <View className="mb-6 flex-row gap-2 rounded-xl bg-accent-soft p-3">
                <Icon as={CalendarClock} size={18} className="mt-0.5 text-accent" />
                <Text className="flex-1 text-sm text-accent">
                  Withdrawal requests open on Fridays. Next window opens {nextFridayLabel()}. Deposits and gifting are
                  available every day.
                </Text>
              </View>
            ) : null}

            {/* Payout account */}
            <Text className="mb-2 text-sm font-medium text-ink-muted">Payout account</Text>
            {accountsLoading ? (
              <Skeleton className="mb-4 h-16 w-full rounded-xl" />
            ) : (
              <View className="mb-4 gap-2">
                {activeAccounts.map((account) => {
                  const selected = selectedAccountId === account.id;
                  return (
                    <Pressable
                      key={account.id}
                      onPress={() => setSelectedAccountId(account.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                        selected ? "border-accent bg-accent-soft" : "border-border bg-surface"
                      }`}
                    >
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-canvas">
                        <Icon as={Landmark} size={16} className="text-ink-muted" />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-sm font-medium text-ink">
                          {account.bank_name}
                        </Text>
                        <Text numberOfLines={1} className="text-xs text-ink-muted">
                          {account.account_name} •••• {account.account_number_last4}
                        </Text>
                      </View>
                      {selected ? <Icon as={Check} size={18} className="text-accent" /> : null}
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => setShowAddAccount((s) => !s)}
                  accessibilityRole="button"
                  className="flex-row items-center gap-1.5 self-start px-1 py-2"
                >
                  <Icon as={Plus} size={16} className="text-accent" />
                  <Text className="text-sm font-medium text-accent">Add bank account</Text>
                </Pressable>
              </View>
            )}

            {showAddAccount ? (
              <View className="mb-6 gap-4 rounded-xl border border-border bg-surface p-4">
                {banksLoading ? (
                  <Skeleton className="h-11 w-full rounded-xl" />
                ) : (
                  <SelectField
                    label="Bank"
                    value={bankCode}
                    options={bankOptions}
                    onChange={setBankCode}
                    placeholder="Choose your bank"
                  />
                )}

                <SurfaceInput
                  label="Account number"
                  value={accountNumber}
                  onChangeText={(v) => setAccountNumber(v.replace(/\D/g, "").slice(0, 10))}
                  keyboardType="number-pad"
                  maxLength={10}
                  placeholder="10-digit account number"
                >
                  {resolving ? <Text className="mt-2 text-sm text-ink-muted">Checking account…</Text> : null}
                  {resolvedName ? (
                    <Text className="mt-2 text-sm text-accent">
                      Account name: <Text className="font-medium text-accent">{resolvedName}</Text>
                    </Text>
                  ) : null}
                  {resolveError ? <Text className="mt-2 text-sm text-danger">{resolveError}</Text> : null}
                </SurfaceInput>

                {addAccountError ? <Text className="text-sm text-danger">{addAccountError}</Text> : null}

                <Button onPress={handleAddAccount} loading={addAccount.isPending} disabled={!resolvedName}>
                  Confirm and add
                </Button>
              </View>
            ) : null}

            {/* Amount */}
            <SurfaceInput
              label="Amount (USD)"
              value={amount}
              onChangeText={(v) => {
                if (AMOUNT_RE.test(v)) {
                  setAmount(v);
                  setError(null);
                }
              }}
              keyboardType="decimal-pad"
              placeholder={`${minimumWithdrawalUsd}.00`}
              editable={isWithdrawalDay}
              style={isWithdrawalDay ? undefined : { opacity: 0.5 }}
            >
              {grossNgn !== null ? (
                <Text className="mt-2 text-xs text-ink-muted">
                  You'll receive {netNgn !== null ? formatNgn(netNgn) : "…"}
                  {feeNgn ? ` (after a ${formatNgn(feeNgn)} Paystack transfer fee)` : ""}
                  {rates?.withdrawal ? ` — rate: $1 = ${formatNgn(rates.withdrawal)}` : ""}
                </Text>
              ) : (
                <Text className="mt-2 text-xs text-ink-muted">Minimum {formatUsd(minimumWithdrawalUsd)}.</Text>
              )}
            </SurfaceInput>

            {error ? (
              <Text accessibilityRole="alert" className="mt-4 text-sm text-danger">
                {error}
              </Text>
            ) : null}

            <View className="mt-5">
              <Button onPress={handleWithdraw} loading={withdraw.isPending} disabled={!isWithdrawalDay || activeAccounts.length === 0}>
                {isWithdrawalDay ? "Request withdrawal" : "Withdrawals open on Fridays"}
              </Button>
            </View>
            {isWithdrawalDay ? (
              <Text className="mt-3 text-center text-xs text-ink-muted">
                Requests submitted today are paid out in Saturday's payout run.
              </Text>
            ) : null}
            {activeAccounts.length === 0 && !accountsLoading ? (
              <Text className="mt-3 text-center text-xs text-ink-muted">Add a bank account to request a withdrawal.</Text>
            ) : null}
          </>
        )}

        {/* History */}
        {withdrawals && withdrawals.length > 0 ? (
          <View className="mt-8">
            <Text className="mb-3 font-display text-lg text-ink">History</Text>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              {withdrawals.map((w, i) => {
                const style = STATUS_STYLES[w.status] ?? STATUS_STYLES.pending;
                return (
                  <View
                    key={w.id}
                    className={`flex-row items-center justify-between gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm text-ink">
                        {formatUsd(w.amount_usd)} → {w.currency} {Number(w.net_amount_local).toFixed(2)}
                      </Text>
                      <Text className="text-xs text-ink-muted">
                        {new Date(w.created_at).toLocaleDateString()}
                        {Number(w.fee_local) > 0 ? ` · ${w.currency} ${Number(w.fee_local).toFixed(2)} fee` : ""}
                      </Text>
                      {w.status === "failed" && w.failure_reason ? (
                        <Text numberOfLines={2} className="mt-0.5 text-xs text-danger">
                          {w.failure_reason}
                        </Text>
                      ) : null}
                    </View>
                    <View className={`rounded-full px-2.5 py-1 ${style.box}`}>
                      <Text className={`text-xs font-medium capitalize ${style.text}`}>{w.status}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoider>
  );
}
