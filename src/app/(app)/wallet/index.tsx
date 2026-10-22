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
  ChevronRight,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { Button, Icon, Text } from "@/components/ui";
import { BrandCard, ON_BRAND, useBrandColor } from "@/components/ui/BrandCard";
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
import { WALLET_PERIODS, inPeriod, type WalletPeriod } from "@/lib/walletPeriod";

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

// Fund is the primary action: a solid white pill with deep-brand text (a light button on a dark brand surface).
// Withdraw is its quieter translucent twin. Same pairing as web.
function CardPill({ icon, label, onPress, primary }: { icon: LucideIcon; label: string; onPress: () => void; primary?: boolean }) {
  const brand = useBrandColor();
  const fg = primary ? brand : ON_BRAND.full;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-full active:opacity-80"
      style={
        primary
          ? { backgroundColor: "#FFFFFF" }
          : { backgroundColor: ON_BRAND.chip, borderWidth: 1, borderColor: ON_BRAND.chipBorder }
      }
    >
      <Icon as={icon} size={18} color={fg} />
      <Text className="text-sm font-semibold" style={{ color: fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

// Secondary destinations sit under the card as quiet surface tiles — the Profile's bordered, rounded-2xl,
// accent-soft icon-chip language.
function ShortcutTile({ icon, title, hint, onPress }: { icon: LucideIcon; title: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-1 flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 active:bg-accent-soft"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
        <Icon as={icon} size={18} className="text-accent" />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-medium text-ink">
          {title}
        </Text>
        <Text numberOfLines={1} className="text-xs text-ink-muted">
          {hint}
        </Text>
      </View>
      <Icon as={ChevronRight} size={16} className="text-ink-muted" />
    </Pressable>
  );
}

type ActivityFilter = "all" | "in" | "out";
const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in", label: "Money in" },
  { id: "out", label: "Money out" },
];

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

  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [period, setPeriod] = useState<WalletPeriod>("all");

  // Period first, so the in/out summary reflects the chosen range regardless of the In/Out filter.
  const periodRows = useMemo(
    () => ((transactions as Txn[] | undefined) ?? []).filter((t) => inPeriod(t.created_at, period)),
    [transactions, period],
  );
  const summary = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    for (const t of periodRows) {
      const amt = Number(t.amount);
      if (amt >= 0) moneyIn += amt;
      else moneyOut += -amt;
    }
    return { moneyIn, moneyOut };
  }, [periodRows]);
  const rows = useMemo(
    () =>
      periodRows.filter((t) => {
        const amt = Number(t.amount);
        return filter === "all" ? true : filter === "in" ? amt >= 0 : amt < 0;
      }),
    [periodRows, filter],
  );

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

  // Pinned above the list (not part of it), so the balance card and its actions never scroll away.
  const card = (
    <View className="px-4 pb-1 pt-4">
      {/* Balance card — the one bold element on the page */}
      <BrandCard className="p-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: ON_BRAND.full }}>
            Available balance
          </Text>
          <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: ON_BRAND.chip, borderWidth: 1, borderColor: ON_BRAND.chipBorder }}>
            <Text className="text-[11px] font-medium tracking-wide" style={{ color: ON_BRAND.full }}>
              USD
            </Text>
          </View>
        </View>

        {isLoading ? (
          <Skeleton className="mb-6 mt-3 h-12 w-40 rounded-xl" />
        ) : (
          <Text className="mb-6 mt-3 font-display text-5xl" style={{ color: ON_BRAND.full }}>
            {formatUsd(wallet?.balance ?? 0)}
          </Text>
        )}

        {depositsEnabled || withdrawalsEnabled ? (
          <View className="flex-row gap-3">
            {depositsEnabled ? <CardPill icon={ArrowDownCircle} label="Fund" primary onPress={() => router.push("/wallet/fund")} /> : null}
            {withdrawalsEnabled ? (
              <CardPill icon={ArrowUpCircle} label="Withdraw" primary={!depositsEnabled} onPress={() => router.push("/wallet/withdraw")} />
            ) : null}
          </View>
        ) : (
          <Text className="text-xs" style={{ color: ON_BRAND.high }}>
            Funding and withdrawals are temporarily unavailable.
          </Text>
        )}

        {/* Withdrawal position — the two numbers people check before asking for money out. */}
        {withdrawalsEnabled && (eligibility || inReviewUsd > 0) ? (
          <View className="mt-6 flex-row gap-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: ON_BRAND.hairline }}>
            <View className="flex-1">
              <Text className="text-[11px] uppercase tracking-wide" style={{ color: ON_BRAND.high }}>
                Can withdraw
              </Text>
              <Text className="mt-0.5 font-display text-xl" style={{ color: ON_BRAND.full }}>
                {formatUsd(eligibility?.available_to_request ?? 0)}
              </Text>
              <Text className="text-[11px]" style={{ color: ON_BRAND.high }}>
                this week
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-[11px] uppercase tracking-wide" style={{ color: ON_BRAND.high }}>
                In review
              </Text>
              <Text className="mt-0.5 font-display text-xl" style={{ color: ON_BRAND.full }}>
                {formatUsd(inReviewUsd)}
              </Text>
              <Text className="text-[11px]" style={{ color: ON_BRAND.high }}>
                on its way to your bank
              </Text>
            </View>
          </View>
        ) : null}
      </BrandCard>
    </View>
  );

  const header = (
    <View>

      <View className="mb-4 flex-row gap-3">
        <ShortcutTile icon={Gem} title="Gift Vault" hint="Gifts received" onPress={() => router.push("/wallet/gifts")} />
        {affiliateEnabled ? (
          <ShortcutTile icon={TrendingUp} title="Affiliate" hint="Links & earnings" onPress={() => router.push("/wallet/affiliate-links")} />
        ) : null}
      </View>

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

      <Text className="mb-3 mt-4 font-display text-lg text-ink">Activity</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 -mx-4" contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setFilter(f.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f.id }}
            className={`rounded-full border px-3.5 py-2 ${filter === f.id ? "border-accent bg-accent" : "border-border bg-surface"}`}
          >
            <Text className={`text-sm ${filter === f.id ? "text-canvas" : "text-ink"}`}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 -mx-4" contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {WALLET_PERIODS.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setPeriod(p.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === p.id }}
            className={`rounded-full border px-3 py-1.5 ${period === p.id ? "border-accent/40 bg-accent-soft" : "border-border"}`}
          >
            <Text className={`text-xs ${period === p.id ? "font-medium text-accent" : "text-ink-muted"}`}>{p.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {periodRows.length > 0 ? (
        <Text className="mb-3 px-1 text-xs text-ink-muted">
          In <Text className="font-medium text-accent">+{formatUsd(summary.moneyIn)}</Text> · Out{" "}
          <Text className="font-medium text-ink">-{formatUsd(summary.moneyOut)}</Text>
          {period !== "all" ? ` · ${WALLET_PERIODS.find((p) => p.id === period)!.label.toLowerCase()}` : ""}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Wallet" icon={WalletIcon} back={false} bar />
      {card}
      <FlatList<Txn>
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        data={refreshing ? [] : rows}
        keyExtractor={(t) => t.id}
        refreshControl={refreshControl}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset + 24 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          refreshing ? (
            <RefreshSkeleton rows={4} />
          ) : (
            <View className="items-center py-10">
              <Text className="text-sm text-ink-muted">
                {transactions && transactions.length > 0 ? "Nothing here for this filter." : "No transactions yet."}
              </Text>
              {!transactions || transactions.length === 0 ? (
                <Text className="mt-1 text-xs text-ink-muted">Everything you fund, spend, and earn will show up here.</Text>
              ) : null}
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const meta = TXN_META[item.type] ?? { label: item.type.replace(/_/g, " "), icon: Receipt, positiveTint: false };
          const amount = Number(item.amount);
          const count = rows.length;
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
