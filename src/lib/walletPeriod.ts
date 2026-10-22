// src/lib/walletPeriod.ts
//
// Time-range filter for the wallet's activity list (shared shape with the native app's
// src/lib/walletPeriod.ts — keep the two in sync).
//   Today      — since local midnight
//   This week  — the last 7 days
//   This month — since the 1st of the current month
//   3 months   — the last 90 days
export type WalletPeriod = "all" | "today" | "week" | "month" | "quarter";

export const WALLET_PERIODS: { id: WalletPeriod; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "quarter", label: "3 months" },
];

/** Start of the period as epoch ms, or null for "all". */
export function periodStart(period: WalletPeriod, now: Date = new Date()): number | null {
  if (period === "all") return null;
  const d = new Date(now);
  if (period === "today") {
    d.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    d.setDate(d.getDate() - 7);
  } else if (period === "month") {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(d.getDate() - 90);
  }
  return d.getTime();
}

export function inPeriod(iso: string, period: WalletPeriod, now: Date = new Date()): boolean {
  const start = periodStart(period, now);
  return start === null || new Date(iso).getTime() >= start;
}
