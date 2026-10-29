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

export type ErrorKind =
  | "insufficient_balance"
  | "network"
  | "timeout"
  | "server"
  | "rate_limit"
  | "too_large"
  | "not_found"
  | "session"
  | "permission"
  | "conflict"
  | "generic";

export interface ClassifiedError {
  kind: ErrorKind;
  /** Safe to show the person as-is. */
  message: string;
  /** A short heading for banners ("Connection problem"). Absent for kinds where the message says it all. */
  title?: string;
  /** True when trying the same thing again might simply work (a blip, a busy server) — drives the "Try again" button. */
  retryable: boolean;
  /** For `insufficient_balance` only, when the raw message carried them: what the wallet holds and what was needed (USD). */
  balance?: number;
  needed?: number;
}

export const LOW_BALANCE_MESSAGE = "Your wallet balance is too low for this. Fund your wallet to continue.";
const NETWORK_MESSAGE = "No internet connection. Check your connection and try again.";
const TIMEOUT_MESSAGE = "This is taking longer than expected. Your connection may be slow — please try again.";
const SERVER_MESSAGE = "We're having trouble on our end. Please try again in a moment.";
const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a moment and try again.";
const TOO_LARGE_MESSAGE = "That file is too large. Try a smaller one.";
const NOT_FOUND_MESSAGE = "We couldn't find that. It may have been removed.";
const SESSION_MESSAGE = "Your session has expired. Please sign in again.";
const PERMISSION_MESSAGE = "You don't have permission to do that.";
const CONFLICT_MESSAGE = "That already exists.";

const LOW_BALANCE = /insufficient (balance|funds)|balance is too low|fund your wallet/i;
// A request that ran out of time is not the same as no connection — someone on 5G with a slow hop should be told to
// retry, not that they're offline.
const TIMEOUT = /timed? ?out|timeout|ETIMEDOUT|gateway time-?out|deadline exceeded/i;
const NETWORK = /network request failed|failed to fetch|network error|networkerror|load failed|fetch failed|ECONN|ENOTFOUND|ENETUNREACH/i;
const SESSION = /jwt (expired|invalid)|invalid jwt|not authenticated|refresh token|auth session missing/i;
const PERMISSION = /row-level security|permission denied|not authorized|forbidden|violates policy/i;
const CONFLICT = /duplicate key|already exists.*(constraint|relation)|unique constraint/i;
// Anything that still looks like an engineer wrote it for a log.
const TECHNICAL =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|violates|constraint|relation "|column "|function public\.|PGRST|SQLSTATE|non-2xx|\bTypeError\b|\bundefined\b|\bnull value\b|syntax error|stack|at \w+\.\w+ \(|^\s*[{[<]|unexpected token|JSON parse error|\bHTTP\b|\bstatus(?: code)?\s*:?\s*\d{3}\b/i;
// "HTTP 504 error", "status code 502", "504 Gateway Time-out", "Error 503" — a status number written into the text.
const STATUS_IN_TEXT =
  /\bHTTP\s*(?:error\s*)?(\d{3})\b|\bstatus(?:\s*code)?\s*:?\s*(\d{3})\b|\b([45]\d{2})\s+(?:error|bad request|unauthorized|forbidden|not found|too many requests|payload too large|bad gateway|service unavailable|gateway time-?out|internal server error)\b|\berror\s*:?\s*([45]\d{2})\b/i;

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

/** A status number carried as a property (supabase-js / storage-js errors: `status`, `statusCode`, `context.status`). */
function propertyStatus(input: unknown): number | null {
  if (!input || typeof input !== "object") return null;
  const e = input as { status?: unknown; statusCode?: unknown; context?: { status?: unknown } };
  for (const v of [e.status, e.statusCode, e.context?.status]) {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n === "number" && Number.isInteger(n) && n >= 400 && n < 600) return n;
  }
  return null;
}

/** A status number written into the message text, e.g. "HTTP 504 error". */
function textStatus(raw: string): number | null {
  const m = STATUS_IN_TEXT.exec(raw);
  const n = m ? Number(m[1] ?? m[2] ?? m[3] ?? m[4]) : NaN;
  return Number.isInteger(n) ? n : null;
}

const BY_KIND: Record<Exclude<ErrorKind, "insufficient_balance" | "generic">, { message: string; title: string; retryable: boolean }> = {
  network: { message: NETWORK_MESSAGE, title: "Connection problem", retryable: true },
  timeout: { message: TIMEOUT_MESSAGE, title: "Taking too long", retryable: true },
  server: { message: SERVER_MESSAGE, title: "Something went wrong on our end", retryable: true },
  rate_limit: { message: RATE_LIMIT_MESSAGE, title: "Slow down a moment", retryable: true },
  too_large: { message: TOO_LARGE_MESSAGE, title: "File too large", retryable: false },
  not_found: { message: NOT_FOUND_MESSAGE, title: "Not found", retryable: false },
  session: { message: SESSION_MESSAGE, title: "Session expired", retryable: false },
  permission: { message: PERMISSION_MESSAGE, title: "Not allowed", retryable: false },
  conflict: { message: CONFLICT_MESSAGE, title: "Already exists", retryable: false },
};

function of(kind: keyof typeof BY_KIND): ClassifiedError {
  return { kind, ...BY_KIND[kind] };
}

/** Maps an HTTP status to a kind. `fromText` statuses are always engineer-speak, so every code is mapped; a status that
 * arrives as a property may sit beside a perfectly good plain-English message (400/404/409/422 from our edge
 * functions), so only the codes whose wording is never meant for people are taken from there. */
function kindForStatus(status: number, fromText: boolean): keyof typeof BY_KIND | null {
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limit";
  if (status === 413) return "too_large";
  if (status >= 500) return "server";
  if (!fromText) return null;
  if (status === 401) return "session";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  return null;
}

export function classifyError(input: unknown, fallback = "Something went wrong. Please try again."): ClassifiedError {
  const raw = rawMessage(input).trim();
  const generic = (message: string): ClassifiedError => ({ kind: "generic", message, retryable: true });

  const byProp = propertyStatus(input);
  const propKind = byProp ? kindForStatus(byProp, false) : null;
  if (!raw) return propKind ? of(propKind) : generic(fallback);

  if (LOW_BALANCE.test(raw)) return { kind: "insufficient_balance", message: LOW_BALANCE_MESSAGE, retryable: false, ...parseAmounts(raw) };

  const inText = textStatus(raw);
  const textKind = inText ? kindForStatus(inText, true) : null;
  if (textKind) return of(textKind);
  if (propKind) return of(propKind);

  if (TIMEOUT.test(raw)) return of("timeout");
  if (NETWORK.test(raw)) return of("network");
  if (SESSION.test(raw)) return of("session");
  if (PERMISSION.test(raw)) return of("permission");
  if (CONFLICT.test(raw)) return of("conflict");
  if (TECHNICAL.test(raw) || raw.length > 160) return generic(fallback);

  return generic(raw);
}

/** The message to show for a failure. `fallback` is the caller's own wording for "we don't know what happened". */
export function friendlyError(input: unknown, fallback: string): string {
  return classifyError(input, fallback).message;
}

export function isInsufficientBalance(input: unknown): boolean {
  return LOW_BALANCE.test(rawMessage(input));
}
