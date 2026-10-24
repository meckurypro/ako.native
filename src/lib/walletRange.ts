// src/lib/walletRange.ts (same file as the web app's src/lib/walletRange.ts — keep the two in sync)
//
// The period the Transactions page is looking at: one calendar month ("Oct 2026"), a span of months
// ("Aug 2026 – Oct 2026"), or everything. Months are in the person's local time. Bounds are [from, to) so a
// transaction at exactly midnight on the 1st belongs to the new month.

export interface YearMonth {
  year: number;
  /** 0 = January … 11 = December (same as Date#getMonth). */
  month: number;
}

export type TxnPeriod =
  | { kind: "month"; at: YearMonth }
  | { kind: "range"; from: YearMonth; to: YearMonth }
  | { kind: "all" };

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const ymOf = (d: Date = new Date()): YearMonth => ({ year: d.getFullYear(), month: d.getMonth() });
export const ymIndex = (ym: YearMonth) => ym.year * 12 + ym.month;
export const ymFromIndex = (i: number): YearMonth => ({ year: Math.floor(i / 12), month: ((i % 12) + 12) % 12 });
export const ymEqual = (a: YearMonth, b: YearMonth) => ymIndex(a) === ymIndex(b);
export const shiftMonths = (ym: YearMonth, by: number) => ymFromIndex(ymIndex(ym) + by);

/** A month can't be in the future. */
export function clampToNow(ym: YearMonth, now: Date = new Date()): YearMonth {
  const current = ymOf(now);
  return ymIndex(ym) > ymIndex(current) ? current : ym;
}

export const formatYm = (ym: YearMonth) => `${MONTH_SHORT[ym.month]} ${ym.year}`;

export function periodLabel(p: TxnPeriod): string {
  if (p.kind === "all") return "All time";
  if (p.kind === "month") return formatYm(p.at);
  return ymEqual(p.from, p.to) ? formatYm(p.from) : `${formatYm(p.from)} – ${formatYm(p.to)}`;
}

/** "Last N months" counting the current month: Aug–Oct for 3 months in October. */
export function lastMonths(n: number, now: Date = new Date()): TxnPeriod {
  const to = ymOf(now);
  return { kind: "range", from: shiftMonths(to, -(n - 1)), to };
}

/** [from, to) as Dates, or nulls for open ends. */
export function periodBounds(p: TxnPeriod): { from: Date | null; to: Date | null } {
  if (p.kind === "all") return { from: null, to: null };
  const first = p.kind === "month" ? p.at : p.from;
  const last = p.kind === "month" ? p.at : p.to;
  const lo = ymIndex(first) <= ymIndex(last) ? first : last;
  const hi = ymIndex(first) <= ymIndex(last) ? last : first;
  return { from: new Date(lo.year, lo.month, 1), to: new Date(hi.year, hi.month + 1, 1) };
}

/** Safe for a file name: 2026-10, 2026-08_to_2026-10, all-time. */
export function periodFileSlug(p: TxnPeriod): string {
  const pad = (ym: YearMonth) => `${ym.year}-${String(ym.month + 1).padStart(2, "0")}`;
  if (p.kind === "all") return "all-time";
  if (p.kind === "month") return pad(p.at);
  return ymEqual(p.from, p.to) ? pad(p.from) : `${pad(p.from)}_to_${pad(p.to)}`;
}
