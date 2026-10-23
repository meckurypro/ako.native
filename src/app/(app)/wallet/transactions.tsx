// src/app/(app)/wallet/transactions.tsx
//
// Full transaction history, one tap from the Wallet. Filter by direction and period; newest first.
import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, Text } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useWalletTransactions } from "@/hooks/useWallet";
import { formatUsd } from "@/lib/money";
import { txnMeta, type Txn } from "@/lib/walletTxn";
import { WALLET_PERIODS, inPeriod, type WalletPeriod } from "@/lib/walletPeriod";

type Direction = "all" | "in" | "out";
const DIRECTIONS: { id: Direction; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in", label: "In" },
  { id: "out", label: "Out" },
];

function txnDate(dateString: string): string {
  const d = new Date(dateString);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

export default function WalletTransactionsScreen() {
  const insets = useSafeAreaInsets();
  const { data: transactions, isLoading, refetch } = useWalletTransactions();
  const [direction, setDirection] = useState<Direction>("all");
  const [period, setPeriod] = useState<WalletPeriod>("all");
  const { refreshControl } = usePullToRefresh([refetch]);

  // Period first, so the in/out summary reflects the chosen range regardless of the direction filter.
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
        return direction === "all" ? true : direction === "in" ? amt >= 0 : amt < 0;
      }),
    [periodRows, direction],
  );

  const header = (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 mb-3" contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}>
        {DIRECTIONS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setDirection(f.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: direction === f.id }}
            className={`rounded-full border px-3.5 py-1.5 ${direction === f.id ? "border-accent bg-accent" : "border-border bg-surface"}`}
          >
            <Text className={`text-sm ${direction === f.id ? "text-canvas" : "text-ink"}`}>{f.label}</Text>
          </Pressable>
        ))}
        <View className="mx-1 h-5 w-px bg-border" />
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
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Transactions" />
      <FlatList<Txn>
        showsVerticalScrollIndicator={false}
        data={rows}
        keyExtractor={(t) => t.id}
        refreshControl={refreshControl}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          isLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : (
            <Text className="py-12 text-center text-sm text-ink-muted">
              {transactions && transactions.length > 0 ? "Nothing here." : "No transactions yet."}
            </Text>
          )
        }
        renderItem={({ item, index }) => {
          const meta = txnMeta(item.type);
          const amount = Number(item.amount);
          return (
            <View
              className={`flex-row items-center gap-3 border-x border-border bg-surface px-4 py-3.5 ${
                index === 0 ? "rounded-t-2xl border-t" : "border-t"
              } ${index === rows.length - 1 ? "rounded-b-2xl border-b" : ""}`}
            >
              <View className={`h-9 w-9 items-center justify-center rounded-full ${meta.positiveTint ? "bg-accent-soft" : "bg-ink/5"}`}>
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
