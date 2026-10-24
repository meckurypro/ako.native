// src/lib/friendlyError.ts
//
// Turns whatever a failed request threw into something a person can read.
//
// Edge functions and Postgres functions raise plain strings that were written for developers and logs — "Insufficient
// balance: wallet 3ec9d8a5-… has 0.00, attempted debit of 2.00", "new row violates row-level security policy for table
// …", "JWT expired". Pasting those on screen leaks ids and table names and tells the person nothing useful. This is
// the one place that decides what is safe to show:
//   - a message that is already plain sentence-case English (the edge functions' own "You already own this.") passes
//     through untouched;
//   - a known technical shape is replaced with a short human equivalent;
//   - anything that still looks technical falls back to the caller's own wording.
//
// Pure (no React, no imports) so it can be unit-tested in node.

export type ErrorKind = "insufficient_balance" | "network" | "session" | "permission" | "conflict" | "generic";

export interface ClassifiedError {
  kind: ErrorKind;
  /** Safe to show the person as-is. */
  message: string;
  /** For `insufficient_balance` only, when the raw message carried them: what the wallet holds and what was needed (USD). */
  balance?: number;
  needed?: number;
}

export const LOW_BALANCE_MESSAGE = "Your wallet balance is too low for this. Fund your wallet to continue.";
const NETWORK_MESSAGE = "No internet connection. Check your connection and try again.";
const SESSION_MESSAGE = "Your session has expired. Please sign in again.";
const PERMISSION_MESSAGE = "You don't have permission to do that.";
const CONFLICT_MESSAGE = "That already exists.";

const LOW_BALANCE = /insufficient (balance|funds)|balance is too low|fund your wallet/i;
const NETWORK = /network request failed|failed to fetch|network error|load failed|timed? ?out|fetch failed|ECONN|ENOTFOUND/i;
const SESSION = /jwt (expired|invalid)|invalid jwt|not authenticated|refresh token|auth session missing/i;
const PERMISSION = /row-level security|permission denied|not authorized|forbidden|violates policy/i;
const CONFLICT = /duplicate key|already exists.*(constraint|relation)|unique constraint/i;
// Anything that still looks like an engineer wrote it for a log.
const TECHNICAL =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|violates|constraint|relation "|column "|function public\.|PGRST|SQLSTATE|non-2xx|\bTypeError\b|\bundefined\b|\bnull value\b|syntax error|stack|at \w+\.\w+ \(|^\s*[{[]/i;

function rawMessage(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof Error) return input.message ?? "";
  if (input && typeof input === "object" && "message" in input && typeof (input as { message: unknown }).message === "string") {
    return (input as { message: string }).message;
  }
  return "";
}

/** "has 0.00, attempted debit of 2.00" → { balance: 0, needed: 2 }. Undefined when the message doesn't carry them. */
function parseAmounts(raw: string): { balance?: number; needed?: number } {
  const m = /has\s+(-?\d+(?:\.\d+)?)\s*,\s*attempted debit of\s+(\d+(?:\.\d+)?)/i.exec(raw);
  if (!m) return {};
  return { balance: Number(m[1]), needed: Number(m[2]) };
}

export function classifyError(input: unknown, fallback = "Something went wrong. Please try again."): ClassifiedError {
  const raw = rawMessage(input).trim();
  if (!raw) return { kind: "generic", message: fallback };

  if (LOW_BALANCE.test(raw)) return { kind: "insufficient_balance", message: LOW_BALANCE_MESSAGE, ...parseAmounts(raw) };
  if (NETWORK.test(raw)) return { kind: "network", message: NETWORK_MESSAGE };
  if (SESSION.test(raw)) return { kind: "session", message: SESSION_MESSAGE };
  if (PERMISSION.test(raw)) return { kind: "permission", message: PERMISSION_MESSAGE };
  if (CONFLICT.test(raw)) return { kind: "conflict", message: CONFLICT_MESSAGE };
  if (TECHNICAL.test(raw) || raw.length > 160) return { kind: "generic", message: fallback };

  return { kind: "generic", message: raw };
}

/** The message to show for a failure. `fallback` is the caller's own wording for "we don't know what happened". */
export function friendlyError(input: unknown, fallback: string): string {
  return classifyError(input, fallback).message;
}

export function isInsufficientBalance(input: unknown): boolean {
  return LOW_BALANCE.test(rawMessage(input));
}
