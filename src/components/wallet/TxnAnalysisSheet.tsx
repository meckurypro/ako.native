// src/components/wallet/TxnAnalysisSheet.tsx
//
// "Analysis": where the money in / out of the chosen period went, by category. Counts successful (completed)
// transactions only — the same rule as the In / Out totals. Mirrors the web sheet.
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { Icon, Text } from "@/components/ui";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { formatUsd } from "@/lib/money";
import { txnMeta, type Txn } from "@/lib/walletTxn";

type Flow = "out" | "in";

export function TxnAnalysisSheet({ rows, periodLabel, onClose }: { rows: Txn[]; periodLabel: string; onClose: () => void }) {
  const [flow, setFlow] = useState<Flow>("out");

  const { totals, byCategory } = useMemo(() => {
    const sums = { in: 0, out: 0 };
    const cats: Record<Flow, Map<string, number>> = { in: new Map(), out: new Map() };
    for (const t of rows) {
      if ((t.status ?? "completed") !== "completed") continue;
      const amt = Number(t.amount);
      if (amt === 0) continue;
      const f: Flow = amt > 0 ? "in" : "out";
      sums[f] += Math.abs(amt);
      cats[f].set(t.type, (cats[f].get(t.type) ?? 0) + Math.abs(amt));
    }
    const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { totals: sums, byCategory: { in: sorted(cats.in), out: sorted(cats.out) } };
  }, [rows]);

  const list = byCategory[flow];
  const total = totals[flow];

  return (
    <SheetFrame title="Analysis" subtitle={periodLabel} onClose={onClose} accessibilityLabel="Analysis">
      <View className="px-4 pb-5 pt-4">
        <View className="flex-row gap-2" accessibilityRole="tablist">
          {(["out", "in"] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFlow(f)}
              accessibilityRole="tab"
              accessibilityState={{ selected: flow === f }}
              className={`flex-1 rounded-2xl border px-4 py-3 ${flow === f ? "border-accent/50 bg-accent-soft" : "border-border bg-canvas"}`}
            >
              <Text className="text-xs text-ink-muted">{f === "out" ? "Money out" : "Money in"}</Text>
              <Text className={`text-lg font-semibold ${flow === f ? "text-accent" : "text-ink"}`}>
                {f === "out" ? "-" : "+"}
                {formatUsd(totals[f])}
              </Text>
            </Pressable>
          ))}
        </View>

        {list.length === 0 ? (
          <Text className="py-10 text-center text-sm text-ink-muted">No {flow === "out" ? "money out" : "money in"} in this period.</Text>
        ) : (
          <View className="mt-5 gap-4">
            {list.map(([type, amount]) => {
              const meta = txnMeta(type);
              const pct = total > 0 ? (amount / total) * 100 : 0;
              return (
                <View key={type} className="flex-row items-center gap-3">
                  <View className={`h-9 w-9 items-center justify-center rounded-full ${meta.positiveTint ? "bg-accent-soft" : "bg-ink/5"}`}>
                    <Icon as={meta.icon} size={16} className={meta.positiveTint ? "text-accent" : "text-ink-muted"} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-baseline justify-between gap-3">
                      <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
                        {meta.label}
                      </Text>
                      <Text className="text-sm font-medium text-ink">{formatUsd(amount)}</Text>
                    </View>
                    <View className="mt-1.5 flex-row items-center gap-2">
                      <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                        <View className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </View>
                      <Text className="w-10 text-right text-xs text-ink-muted">{pct.toFixed(0)}%</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </SheetFrame>
  );
}
