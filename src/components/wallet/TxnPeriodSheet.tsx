// src/components/wallet/TxnPeriodSheet.tsx
//
// Choose what the Transactions screen shows: one MONTH (wheel picker), or a TIME FRAME — the last 3 / 6 months,
// everything, or a custom start/end month. Mirrors the web sheet.
import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button, Icon, Text } from "@/components/ui";
import { SheetFrame } from "@/components/ui/SheetFrame";
import {
  formatYm,
  lastMonths,
  shiftMonths,
  ymEqual,
  ymIndex,
  ymOf,
  type TxnPeriod,
  type YearMonth,
} from "@/lib/walletRange";
import { MonthYearPicker } from "./MonthWheel";

type Tab = "month" | "frame";
type Preset = "3m" | "6m" | "all" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "3m", label: "Last 3 months" },
  { id: "6m", label: "Last 6 months" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

function presetOf(period: TxnPeriod): Preset {
  if (period.kind === "all") return "all";
  if (period.kind === "range") {
    for (const [id, n] of [["3m", 3], ["6m", 6]] as const) {
      const p = lastMonths(n);
      if (p.kind === "range" && ymEqual(p.from, period.from) && ymEqual(p.to, period.to)) return id;
    }
    return "custom";
  }
  return "3m";
}

export function TxnPeriodSheet({
  period,
  onApply,
  onClose,
}: {
  period: TxnPeriod;
  onApply: (period: TxnPeriod) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(period.kind === "month" ? "month" : "frame");
  const [month, setMonth] = useState<YearMonth>(period.kind === "month" ? period.at : ymOf());
  const [preset, setPreset] = useState<Preset>(presetOf(period));
  const [from, setFrom] = useState<YearMonth>(period.kind === "range" ? period.from : shiftMonths(ymOf(), -2));
  const [to, setTo] = useState<YearMonth>(period.kind === "range" ? period.to : ymOf());
  const [editing, setEditing] = useState<"from" | "to" | null>(null);

  const invalid = tab === "frame" && preset !== "all" && ymIndex(from) > ymIndex(to);

  function choosePreset(next: Preset) {
    setPreset(next);
    setEditing(next === "custom" ? "from" : null);
    if (next === "3m" || next === "6m") {
      const p = lastMonths(next === "3m" ? 3 : 6);
      if (p.kind === "range") {
        setFrom(p.from);
        setTo(p.to);
      }
    }
  }

  function toggleEditing(which: "from" | "to") {
    setPreset("custom");
    setEditing((cur) => (cur === which ? null : which));
  }

  function confirm() {
    if (invalid) return;
    if (tab === "month") onApply({ kind: "month", at: month });
    else onApply(preset === "all" ? { kind: "all" } : { kind: "range", from, to });
    onClose();
  }

  const dateRow = (which: "from" | "to", title: string, value: YearMonth) => (
    <View>
      <Text className="mb-2 mt-5 text-base text-ink">{title}</Text>
      <Pressable
        onPress={() => toggleEditing(which)}
        accessibilityRole="button"
        accessibilityState={{ expanded: editing === which }}
        className={`flex-row items-center justify-between rounded-xl border bg-canvas px-4 py-3.5 ${
          editing === which ? "border-accent/60" : "border-border"
        } ${preset === "all" ? "opacity-50" : ""}`}
      >
        <Text className="text-base text-ink">{formatYm(value)}</Text>
        <Icon as={ChevronDown} size={18} className="text-ink-muted" />
      </Pressable>
      {editing === which ? (
        <View className="mt-2">
          <MonthYearPicker value={value} onChange={which === "from" ? setFrom : setTo} />
        </View>
      ) : null}
    </View>
  );

  return (
    <SheetFrame
      title="Choose period"
      onClose={onClose}
      accessibilityLabel="Choose period"
      footer={
        <View className="px-4 pb-4 pt-2">
          <Button onPress={confirm} disabled={invalid} accessibilityLabel="Confirm">
            Confirm
          </Button>
        </View>
      }
    >
      <View className="px-4 pb-2 pt-3">
        <View className="flex-row gap-6 border-b border-border" accessibilityRole="tablist">
          {(
            [
              ["month", "Month"],
              ["frame", "Time Frame"],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setTab(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === id }}
              className={`-mb-px border-b-2 pb-3 ${tab === id ? "border-accent" : "border-transparent"}`}
            >
              <Text className={`text-base ${tab === id ? "text-ink" : "text-ink-muted"}`}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "month" ? (
          <View className="pb-2 pt-4">
            <MonthYearPicker value={month} onChange={setMonth} />
          </View>
        ) : (
          <View className="pt-4">
            <Text className="mb-3 text-base text-ink">Duration</Text>
            <View className="flex-row flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => choosePreset(p.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: preset === p.id }}
                  className={`rounded-xl border px-4 py-2.5 ${preset === p.id ? "border-accent/50 bg-accent-soft" : "border-border bg-canvas"}`}
                >
                  <Text className={`text-sm ${preset === p.id ? "font-medium text-accent" : "text-ink"}`}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            {dateRow("from", "Start Date", from)}
            {dateRow("to", "End Date", to)}
            {invalid ? <Text className="mt-3 text-sm text-danger">The start month has to be before the end month.</Text> : null}
          </View>
        )}
      </View>
    </SheetFrame>
  );
}
