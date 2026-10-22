// src/app/(app)/wallet/index.tsx
//
// Wallet home: balance, Fund / Withdraw / Vault / Affiliate actions, recent activity, and a status banner for a
// payment that's still being confirmed. Port of the web Wallet page.
//
// Funding always happens on the web (Paystack) and returns here by deep link.
// Withdrawals have their own screen (wallet/withdraw); Friday-only requests, paid out Saturdays.
import { router } from "expo-router";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Gem,
  Gift,
  Heart,
  Megaphone,
  Receipt,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Wallet as WalletIcon,
  type LucideIcon,
} from "lucide-react-native";
import { useEffect, useRef } from "react";
import { FlatList, Pressable, View } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { Button, Icon, Text } from "@/components/ui";
import { RefreshSkeleton } from "@/components/ui/RefreshSkeleton";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDeposits, useVerifyDeposit } from "@/hooks/useDeposits";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useWithdrawals } from "@/hooks/usePayout";
import { useWallet, useWalletTransactions } from "@/hooks/useWallet";
import { useWithdrawalEligibility } from "@/hooks/useWalletRates";
import { formatUsd } from "@/lib/money";

// Per-type label, icon and tint — scanning history by icon is faster than reading every line.
const TXN_META: Record<string, { label: string; icon: LucideIcon; positiveTint: boolean }> = {
  fund: { label: "Wallet funded", icon: ArrowDownCircle, positiveTint: true },
  gift_sent: { label: "Gift sent", icon: Gift, positiveTint: false },
  gift_received: { label: "Gift received", icon: Gift, positiveTint: true },
  purchase_sent: { label: "Purchase", icon: Receipt, positiveTint: false },
  purchase_received: { label: "Sale", icon: Receipt, positiveTint: true },
  platform_fee: { label: "Platform fee", icon: Receipt, positiveTint: false },
  withdrawal: { label: "Withdrawal", icon: ArrowUpCircle, positiveTint: false },
  reversal: { label: "Reversal", icon: RotateCcw, positiveTint: true },
  dev_credit: { label: "Dev credit", icon: Sparkles, positiveTint: true },
  affiliate_commission: { label: "Affiliate commission", icon: TrendingUp, positiveTint: true },
  affiliate_commission_reversal: { label: "Affiliate commission reversed", icon: RotateCcw, positiveTint: false },
  promotion_charge: { label: "Promotion charge", icon: Megaphone, positiveTint: false },
  promotion_refund: { label: "Promotion refund", icon: RotateCcw, positiveTint: true },
  give_back: { label: "Give Back reward", icon: Heart, positiveTint: true },
  give_back_reversal: { label: "Give Back reward reversed", icon: RotateCcw, positiveTint: false },
};

interface Txn {
  id: string;
  type: string;
  amount: number | string;
  created_at: string;
}

function txnDate(dateString: string): string {
  const d = new Date(dateString);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

function BalanceAction({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="items-center gap-1.5 active:opacity-70">
      <View className="h-11 w-11 items-center justify-center rounded-full bg-canvas/15">
        <Icon as={icon} size={20} className="text-canvas" />
      </View>
      <Text className="text-xs font-medium text-canvas">{label}</Text>
    </Pressable>
  );
}

const RECENT_PENDING_MS = 30 * 60 * 1000;

export default function WalletScreen() {
  const bottomInset = useBottomNavInset();
  const { data: wallet, isLoading, refetch: refetchWallet } = useWallet();
  const { data: transactions, refetch: refetchTxns } = useWalletTransactions();
  const { data: deposits, refetch: refetchDeposits } = useDeposits();
  const verifyDeposit = useVerifyDeposit();

  const walletEnabled = useFeatureFlag("wallet_enabled");
  const depositsEnabled = useFeatureFlag("deposits_enabled");
  const withdrawalsEnabled = useFeatureFlag("withdrawals_enabled");
  const affiliateEnabled = useFeatureFlag("affiliate_programs_enabled");
  const { data: eligibility, refetch: refetchEligibility } = useWithdrawalEligibility();
  const { data: withdrawals, refetch: refetchWithdrawals } = useWithdrawals();

  // Requests that have left the wallet but not yet reached the bank.
  const inReviewUsd = (withdrawals ?? [])
    .filter((w) => w.status === "pending" || w.status === "processing")
    .reduce((sum, w) => sum + Number(w.amount_usd), 0);

  const { refreshControl, refreshing } = usePullToRefresh([refetchWallet, refetchTxns, refetchDeposits, refetchEligibility, refetchWithdrawals]);

  // A payment started in the last half hour that hasn't been confirmed yet (user closed the browser
  // early, or the webhook is slow). Confirm it automatically once per reference, and let them re-check.
  const pending = (deposits ?? []).filter(
    (d) => d.status === "pending" && Date.now() - new Date(d.created_at).getTime() < RECENT_PENDING_MS,
  );
  const checked = useRef(new Set<string>());
  useEffect(() => {
    for (const d of pending) {
      if (checked.current.has(d.paystack_reference)) continue;
      checked.current.add(d.paystack_reference);
      verifyDeposit.mutate(d.paystack_reference, { onSettled: () => void refetchDeposits() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.map((d) => d.paystack_reference).join(",")]);

  function recheck() {
    for (const d of pending) {
      verifyDeposit.mutate(d.paystack_reference, { onSettled: () => void refetchDeposits() });
    }
  }

  if (!walletEnabled) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="Wallet" icon={WalletIcon} back={false} bar />
        <Text className="px-4 pt-10 text-center text-sm text-ink-muted">
          The wallet is temporarily unavailable. Check back later.
        </Text>
      </View>
    );
  }

  const header = (
    <View>
      {/* Balance card — the one bold element on the page */}
      <View className="mb-4 overflow-hidden rounded-[28px] bg-accent p-6 pt-7">
        <View className="absolute -right-6 -top-6 opacity-[0.12]" pointerEvents="none">
          <Icon as={WalletIcon} size={140} strokeWidth={1} className="text-canvas" />
        </View>
        <Text className="text-xs font-medium uppercase tracking-[0.14em] text-canvas/70">Available balance</Text>
        {isLoading ? (
          <Skeleton className="mb-8 mt-3 h-12 w-40 rounded-xl" />
        ) : (
          <Text className="mb-8 mt-3 font-display text-5xl text-canvas">{formatUsd(wallet?.balance ?? 0)}</Text>
        )}

        <View className="flex-row justify-between">
          {depositsEnabled ? <BalanceAction icon={ArrowDownCircle} label="Fund" onPress={() => router.push("/wallet/fund")} /> : null}
          {withdrawalsEnabled ? <BalanceAction icon={ArrowUpCircle} label="Withdraw" onPress={() => router.push("/wallet/withdraw")} /> : null}
          <BalanceAction icon={Gem} label="Vault" onPress={() => router.push("/wallet/gifts")} />
          {affiliateEnabled ? <BalanceAction icon={TrendingUp} label="Affiliate" onPress={() => router.push("/wallet/affiliate-links")} /> : null}
        </View>
        {!depositsEnabled && !withdrawalsEnabled ? (
          <Text className="mt-4 text-xs text-canvas/70">Funding and withdrawals are temporarily unavailable.</Text>
        ) : null}
      </View>

      {/* Withdrawal position — the two numbers people check before asking for money out. */}
      {withdrawalsEnabled && (eligibility || inReviewUsd > 0) ? (
        <View className="mb-4 flex-row gap-3">
          <View className="flex-1 rounded-2xl border border-border bg-surface px-4 py-3">
            <Text className="text-[11px] uppercase tracking-wide text-ink-muted">Can withdraw</Text>
            <Text className="mt-0.5 font-display text-xl text-ink">{formatUsd(eligibility?.available_to_request ?? 0)}</Text>
            <Text className="mt-0.5 text-[11px] text-ink-muted">this week</Text>
          </View>
          <View className="flex-1 rounded-2xl border border-border bg-surface px-4 py-3">
            <Text className="text-[11px] uppercase tracking-wide text-ink-muted">In review</Text>
            <Text className="mt-0.5 font-display text-xl text-ink">{formatUsd(inReviewUsd)}</Text>
            <Text className="mt-0.5 text-[11px] text-ink-muted">on its way to your bank</Text>
          </View>
        </View>
      ) : null}

      {pending.length > 0 ? (
        <View className="mb-4 rounded-2xl border border-border bg-surface p-4">
          <Text className="text-sm font-medium text-ink">Confirming your payment…</Text>
          <Text className="mt-1 text-xs text-ink-muted">
            If you've paid, your wallet will be credited as soon as Paystack confirms it — usually within a minute.
          </Text>
          <Button size="sm" variant="secondary" className="mt-3" loading={verifyDeposit.isPending} onPress={recheck}>
            Check again
          </Button>
        </View>
      ) : null}

      <Text className="mb-3 mt-4 font-display text-lg text-ink">Recent activity</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Wallet" icon={WalletIcon} back={false} bar />
      <FlatList<Txn>
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        data={refreshing ? [] : ((transactions as Txn[] | undefined) ?? [])}
        keyExtractor={(t) => t.id}
        refreshControl={refreshControl}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: bottomInset + 24 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          refreshing ? (
            <RefreshSkeleton rows={4} />
          ) : (
            <View className="items-center py-10">
              <Text className="text-sm text-ink-muted">No transactions yet.</Text>
              <Text className="mt-1 text-xs text-ink-muted">Everything you fund, spend, and earn will show up here.</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const meta = TXN_META[item.type] ?? { label: item.type.replace(/_/g, " "), icon: Receipt, positiveTint: false };
          const amount = Number(item.amount);
          const count = transactions?.length ?? 0;
          return (
            <View
              className={`flex-row items-center gap-3 border-x border-border bg-surface px-4 py-3.5 ${
                index === 0 ? "rounded-t-2xl border-t" : "border-t"
              } ${index === count - 1 ? "rounded-b-2xl border-b" : ""}`}
            >
              <View
                className={`h-9 w-9 items-center justify-center rounded-full ${meta.positiveTint ? "bg-accent-soft" : "bg-ink/5"}`}
              >
                <Icon as={meta.icon} size={16} className={meta.positiveTint ? "text-accent" : "text-ink-muted"} />
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-sm text-ink">
                  {meta.label}
                </Text>
                <Text className="text-xs text-ink-muted">{txnDate(item.created_at)}</Text>
              </View>
              <Text className={`text-sm font-medium ${amount >= 0 ? "text-accent" : "text-ink"}`}>
                {amount >= 0 ? "+" : "-"}
                {formatUsd(Math.abs(amount))}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}
