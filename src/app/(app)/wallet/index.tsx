// src/app/(app)/wallet/index.tsx
//
// Wallet home — compact, nothing behind a menu: balance card (Fund / Withdraw), the latest transaction (tap through to
// the full history at wallet/transactions), Can withdraw / In review, and a short row of links. A status banner shows
// while a payment is still being confirmed. Port of the web Wallet page.
//
// Funding always happens on the web (Paystack) and returns here by deep link.
// Withdrawals have their own screen (wallet/withdraw); Friday-only requests, paid out Saturdays.
import { router } from "expo-router";
import { ArrowDownCircle, ArrowUpCircle, ChevronRight, Gem, ReceiptText, TrendingUp, Wallet as WalletIcon, type LucideIcon } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { Button, Icon, Text } from "@/components/ui";
import { BrandCard, ON_BRAND, useBrandColor } from "@/components/ui/BrandCard";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDeposits, useVerifyDeposit } from "@/hooks/useDeposits";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useWithdrawals } from "@/hooks/usePayout";
import { useWallet, useWalletTransactions } from "@/hooks/useWallet";
import { useWithdrawalEligibility } from "@/hooks/useWalletRates";
import { formatUsd } from "@/lib/money";
import { txnMeta, type Txn } from "@/lib/walletTxn";

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

// One tile in the links row: icon in a soft circle, one-word label.
function Tile({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="flex-1 items-center gap-2 py-1 active:opacity-70">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
        <Icon as={icon} size={22} className="text-accent" />
      </View>
      <Text className="text-xs text-ink">{label}</Text>
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

  const latest = (transactions as Txn[] | undefined)?.[0];
  const latestMeta = latest ? txnMeta(latest.type) : null;
  const latestAmount = latest ? Number(latest.amount) : 0;

  const { refreshControl } = usePullToRefresh([refetchWallet, refetchTxns, refetchDeposits, refetchEligibility, refetchWithdrawals]);

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
        <Text className="px-4 pt-10 text-center text-sm text-ink-muted">Wallet unavailable. Check back soon.</Text>
      </View>
    );
  }

  const tiles: { key: string; icon: LucideIcon; label: string; to: string }[] = [
    { key: "transactions", icon: ReceiptText, label: "Transactions", to: "/wallet/transactions" },
    { key: "gifts", icon: Gem, label: "Gift Vault", to: "/wallet/gifts" },
    ...(affiliateEnabled ? [{ key: "affiliate", icon: TrendingUp, label: "Affiliate", to: "/wallet/affiliate-links" }] : []),
  ];

  // Nothing on this screen is pinned: the header and content scroll together.
  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 24 }}
      >
        <View className="-mx-4">
          <ScreenHeader title="Wallet" icon={WalletIcon} back={false} bar />
        </View>

        {/* Balance card — the one bold element on the page */}
        <View className="pt-4">
          <BrandCard className="p-6">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: ON_BRAND.full }}>
                Balance
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
                Funding and withdrawals are paused.
              </Text>
            )}
          </BrandCard>
        </View>

        {pending.length > 0 ? (
          <View className="mt-3 flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-medium text-ink">Confirming your payment…</Text>
              <Text className="text-xs text-ink-muted">Usually under a minute.</Text>
            </View>
            <Button size="sm" variant="secondary" loading={verifyDeposit.isPending} onPress={recheck}>
              Check
            </Button>
          </View>
        ) : null}

        {/* Latest transaction → full history */}
        <Pressable
          onPress={() => router.push("/wallet/transactions")}
          accessibilityRole="button"
          accessibilityLabel="Transactions"
          className="mt-3 flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 active:opacity-70"
        >
          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
            {latest && latestMeta ? (
              <>
                {latestMeta.label}{" "}
                <Text className={`text-sm font-medium ${latestAmount >= 0 ? "text-accent" : "text-ink"}`}>
                  {latestAmount >= 0 ? "+" : "-"}
                  {formatUsd(Math.abs(latestAmount))}
                </Text>
              </>
            ) : (
              <Text className="text-sm text-ink-muted">No transactions yet</Text>
            )}
          </Text>
          <View className="flex-row items-center">
            <Text className="text-xs text-ink-muted">Transactions</Text>
            <Icon as={ChevronRight} size={16} className="text-ink-muted" />
          </View>
        </Pressable>

        {/* Can withdraw / In review */}
        {withdrawalsEnabled ? (
          <Pressable
            onPress={() => router.push("/wallet/withdraw")}
            accessibilityRole="button"
            accessibilityLabel="Withdrawals"
            className="mt-3 flex-row overflow-hidden rounded-2xl border border-border bg-surface active:opacity-70"
          >
            <View className="flex-1 px-4 py-3">
              <Text className="text-xs text-ink-muted">Can withdraw</Text>
              <Text className="mt-0.5 text-base font-semibold text-ink">{formatUsd(eligibility?.available_to_request ?? 0)}</Text>
            </View>
            <View className="w-px bg-border" />
            <View className="flex-1 px-4 py-3">
              <Text className="text-xs text-ink-muted">In review</Text>
              <Text className="mt-0.5 text-base font-semibold text-ink">{formatUsd(inReviewUsd)}</Text>
            </View>
          </Pressable>
        ) : null}

        {/* Links */}
        <View className="mt-3 flex-row rounded-2xl border border-border bg-surface px-2 py-3">
          {tiles.map((t) => (
            <Tile key={t.key} icon={t.icon} label={t.label} onPress={() => router.push(t.to as never)} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
