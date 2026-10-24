// src/app/(app)/wallet/transactions.tsx
//
// Full transaction history, one tap from the Wallet. Port of the web Transactions page.
//   • Category and status dropdowns (chips) narrow the list.
//   • The period header ("Oct 2026 ▾") opens a Month / Time Frame picker; it shows what came In and went Out in the
//     period, and tapping In or Out filters the list to that direction.
//   • Analysis breaks the period down by category; Download shares exactly what is on screen as a CSV.
// Totals and the analysis count successful (completed) transactions only.
import { ChevronDown, Download } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, Text, useToast } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { TxnAnalysisSheet } from "@/components/wallet/TxnAnalysisSheet";
import { TxnPeriodSheet } from "@/components/wallet/TxnPeriodSheet";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useWalletTransactionsInRange } from "@/hooks/useWallet";
import { formatUsd } from "@/lib/money";
import { buildTransactionsCsv, shareCsv } from "@/lib/walletCsv";
import { periodBounds, periodFileSlug, periodLabel, ymOf, type TxnPeriod } from "@/lib/walletRange";
import { statusMeta, txnMeta, TXN_STATUS_ORDER, type Txn } from "@/lib/walletTxn";

type Direction = "all" | "in" | "out";
type Panel = "category" | "status" | null;

function txnWhen(dateString: string): string {
  const d = new Date(dateString);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

function FilterTrigger({ label, open, active, onPress }: { label: string; open: boolean; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      className={`flex-1 flex-row items-center justify-between gap-2 rounded-xl border px-4 py-3 ${
        open || active ? "border-accent/40 bg-accent-soft" : "border-border bg-surface"
      }`}
    >
      <Text numberOfLines={1} className={`min-w-0 flex-1 text-center text-sm ${open || active ? "text-accent" : "text-ink"}`}>
        {label}
      </Text>
      <Icon as={ChevronDown} size={16} className={open || active ? "text-accent" : "text-ink-muted"} />
    </Pressable>
  );
}

function Chip({ selected, onPress, label }: { selected: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-xl px-4 py-2.5 ${selected ? "border border-accent/40 bg-accent-soft" : "border border-transparent bg-canvas"}`}
    >
      <Text className={`text-sm ${selected ? "font-medium text-accent" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}

export default function WalletTransactionsScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [period, setPeriod] = useState<TxnPeriod>(() => ({ kind: "month", at: ymOf() }));
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [direction, setDirection] = useState<Direction>("all");
  const [panel, setPanel] = useState<Panel>(null);
  const [showPeriod, setShowPeriod] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [sharing, setSharing] = useState(false);

  const bounds = useMemo(() => periodBounds(period), [period]);
  const { data, isLoading, isError, isPlaceholderData, refetch } = useWalletTransactionsInRange(bounds.from, bounds.to);
  const { refreshControl } = usePullToRefresh([refetch]);
  const periodRows = useMemo(() => (data as Txn[] | undefined) ?? [], [data]);
  const label = periodLabel(period);

  // Categories that actually occur in this period (a chip with nothing behind it is just noise).
  const categories = useMemo(() => {
    const types = [...new Set(periodRows.map((t) => t.type))];
    return types.sort((a, b) => txnMeta(a).label.localeCompare(txnMeta(b).label));
  }, [periodRows]);

  // A category picked in one month may not exist in the next — fall back to "all" rather than show an empty list.
  const activeCategory = !isPlaceholderData && category !== "all" && !categories.includes(category) ? "all" : category;

  // Category + status narrow everything; direction only narrows the list (the In/Out totals stay put so they can
  // double as the direction toggle).
  const scoped = useMemo(
    () => periodRows.filter((t) => (activeCategory === "all" || t.type === activeCategory) && (status === "all" || (t.status ?? "completed") === status)),
    [periodRows, activeCategory, status],
  );

  const summary = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    for (const t of scoped) {
      if ((t.status ?? "completed") !== "completed") continue;
      const amt = Number(t.amount);
      if (amt > 0) moneyIn += amt;
      else if (amt < 0) moneyOut += -amt;
    }
    return { moneyIn, moneyOut };
  }, [scoped]);

  const rows = useMemo(
    () =>
      scoped.filter((t) => {
        const amt = Number(t.amount);
        return direction === "all" ? true : direction === "in" ? amt > 0 : amt < 0;
      }),
    [scoped, direction],
  );

  async function handleDownload() {
    if (rows.length === 0 || sharing) return;
    setSharing(true);
    const loadingToast = toast("Preparing download…", { variant: "loading" });
    try {
      await shareCsv(`ako-transactions-${periodFileSlug(period)}.csv`, buildTransactionsCsv(rows));
      loadingToast.dismiss();
    } catch (err) {
      loadingToast.dismiss();
      toast(err instanceof Error ? err.message : "Couldn't prepare the download.", { variant: "error" });
    } finally {
      setSharing(false);
    }
  }

  const categoryLabel = activeCategory === "all" ? "All Categories" : txnMeta(activeCategory).label;
  const statusLabel = status === "all" ? "All Status" : statusMeta(status).label;
  const filtersActive = activeCategory !== "all" || status !== "all" || direction !== "all";

  const header = (
    <View>
      {/* Category / status dropdowns */}
      <View className="flex-row gap-3">
        <FilterTrigger label={categoryLabel} open={panel === "category"} active={activeCategory !== "all"} onPress={() => setPanel(panel === "category" ? null : "category")} />
        <FilterTrigger label={statusLabel} open={panel === "status"} active={status !== "all"} onPress={() => setPanel(panel === "status" ? null : "status")} />
      </View>

      {panel ? (
        <View className="mt-2 flex-row flex-wrap gap-2 rounded-2xl border border-border bg-surface p-3">
          {panel === "category" ? (
            <>
              <Chip
                label="All Categories"
                selected={activeCategory === "all"}
                onPress={() => {
                  setCategory("all");
                  setPanel(null);
                }}
              />
              {categories.map((type) => (
                <Chip
                  key={type}
                  label={txnMeta(type).label}
                  selected={activeCategory === type}
                  onPress={() => {
                    setCategory(type);
                    setPanel(null);
                  }}
                />
              ))}
            </>
          ) : (
            <>
              <Chip
                label="All Status"
                selected={status === "all"}
                onPress={() => {
                  setStatus("all");
                  setPanel(null);
                }}
              />
              {TXN_STATUS_ORDER.map((s) => (
                <Chip
                  key={s}
                  label={statusMeta(s).label}
                  selected={status === s}
                  onPress={() => {
                    setStatus(s);
                    setPanel(null);
                  }}
                />
              ))}
            </>
          )}
        </View>
      ) : null}

      {/* Period + totals */}
      <View className="mb-4 mt-3 rounded-2xl border border-border bg-surface px-4 py-3.5">
        <View className="flex-row items-center justify-between gap-3">
          <Pressable
            onPress={() => setShowPeriod(true)}
            accessibilityRole="button"
            accessibilityLabel={`Period: ${label}. Change period`}
            className="min-w-0 flex-1 flex-row items-center gap-1.5 active:opacity-70"
          >
            <Text numberOfLines={1} className="shrink font-display text-xl text-ink">
              {label}
            </Text>
            <Icon as={ChevronDown} size={18} className="text-ink-muted" />
          </Pressable>
          <Pressable
            onPress={() => setShowAnalysis(true)}
            accessibilityRole="button"
            accessibilityLabel="Analysis"
            className="rounded-full bg-accent-soft px-4 py-1.5 active:opacity-70"
          >
            <Text className="text-sm font-medium text-accent">Analysis</Text>
          </Pressable>
        </View>
        <View className="mt-2 flex-row flex-wrap items-center gap-x-5 gap-y-1">
          <Pressable
            onPress={() => setDirection(direction === "in" ? "all" : "in")}
            accessibilityRole="button"
            accessibilityState={{ selected: direction === "in" }}
            className={`rounded-md py-0.5 ${direction === "in" ? "bg-accent-soft px-1.5" : ""}`}
          >
            <Text className={`text-sm ${direction === "in" ? "text-accent" : "text-ink-muted"}`}>
              In: <Text className="text-sm font-medium text-accent">+{formatUsd(summary.moneyIn)}</Text>
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setDirection(direction === "out" ? "all" : "out")}
            accessibilityRole="button"
            accessibilityState={{ selected: direction === "out" }}
            className={`rounded-md py-0.5 ${direction === "out" ? "bg-ink/5 px-1.5" : ""}`}
          >
            <Text className={`text-sm ${direction === "out" ? "text-ink" : "text-ink-muted"}`}>
              Out: <Text className="text-sm font-medium text-ink">-{formatUsd(summary.moneyOut)}</Text>
            </Text>
          </Pressable>
          {filtersActive ? (
            <Pressable
              onPress={() => {
                setCategory("all");
                setStatus("all");
                setDirection("all");
              }}
              accessibilityRole="button"
            >
              <Text className="text-xs text-ink-muted underline">Clear filters</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        title="Transactions"
        right={
          <Pressable
            onPress={() => void handleDownload()}
            disabled={rows.length === 0 || sharing}
            accessibilityRole="button"
            accessibilityLabel="Download transactions"
            hitSlop={8}
            className={`flex-row items-center gap-1.5 ${rows.length === 0 || sharing ? "opacity-40" : "active:opacity-70"}`}
          >
            <Icon as={Download} size={16} className="text-accent" />
            <Text className="text-sm font-medium text-accent">Download</Text>
          </Pressable>
        }
      />
      <FlatList<Txn>
        showsVerticalScrollIndicator={false}
        data={rows}
        keyExtractor={(t) => t.id}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        style={{ opacity: isPlaceholderData ? 0.6 : 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          isLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : isError ? (
            <Text className="py-12 text-center text-sm text-danger">Couldn't load your transactions. Pull down to try again.</Text>
          ) : (
            <Text className="py-12 text-center text-sm text-ink-muted">
              {periodRows.length > 0 ? "Nothing matches these filters." : `No transactions in ${label}.`}
            </Text>
          )
        }
        renderItem={({ item, index }) => {
          const meta = txnMeta(item.type);
          const st = statusMeta(item.status);
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
                <Text className="text-xs text-ink-muted">{txnWhen(item.created_at)}</Text>
              </View>
              <View className="items-end gap-1">
                <Text className={`text-sm font-medium ${amount > 0 ? "text-accent" : "text-ink"}`}>
                  {amount > 0 ? "+" : amount < 0 ? "-" : ""}
                  {formatUsd(Math.abs(amount))}
                </Text>
                <View className={`rounded-md px-1.5 py-0.5 ${st.bg}`}>
                  <Text className={`text-[10px] font-medium leading-none ${st.fg}`}>{st.label}</Text>
                </View>
              </View>
            </View>
          );
        }}
      />

      {showPeriod ? <TxnPeriodSheet period={period} onApply={setPeriod} onClose={() => setShowPeriod(false)} /> : null}
      {showAnalysis ? <TxnAnalysisSheet rows={periodRows} periodLabel={label} onClose={() => setShowAnalysis(false)} /> : null}
    </View>
  );
}
