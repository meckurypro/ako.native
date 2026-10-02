// src/lib/money.ts
//
// Display-only formatting. Every actual USD<->NGN conversion is
// computed server-side by the convert_currency() Postgres function
// (exact numeric arithmetic) — nothing here ever multiplies an
// amount by a rate. These helpers only format numbers the server
// already gave us.

export function formatUsd(amount: number | string): string {
  return `$${Number(amount).toFixed(2)}`;
}

export function formatNgn(amount: number | string): string {
  return `₦${Number(amount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
