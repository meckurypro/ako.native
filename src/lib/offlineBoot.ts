// src/lib/offlineBoot.ts
//
// Pure helpers (no React Native imports — unit-tested in node, scripts/test-offline-boot.mjs) behind one rule:
// the app must never sit on a spinner waiting for a network that isn't coming.
//
// A phone that is "connected" but has no working data (weak signal, Wi‑Fi without internet, a captive portal) does
// not fail requests quickly — it hangs until the OS gives up, often a minute or more. React Query treats that as
// "online", so every screen that gates on a first fetch stays on "Loading…" and the splash never lifts. These
// helpers let the boot path and the gates put a ceiling on how long they will wait.

/** The error text fetch / supabase-js / postgrest-js produce when a request never reached a server. */
const NETWORK_MESSAGE =
  /network request failed|failed to fetch|fetch failed|network ?error|load failed|networkerror|timed? ?out|timeout|econnrefused|enotfound|econnreset|offline|internet connection/i;

/**
 * True when a request failed because the server couldn't be reached — as opposed to the server answering "no"
 * (permission denied, not found, bad input), which must keep behaving exactly as before.
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; message?: unknown; code?: unknown; status?: unknown };
  if (e.name === "AuthRetryableFetchError") return true;
  // An HTTP answer (any status) means the network worked.
  if (typeof e.status === "number" && e.status > 0) return false;
  if (typeof e.code === "string" && /^(ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|ENETUNREACH)$/.test(e.code)) return true;
  return typeof e.message === "string" && NETWORK_MESSAGE.test(e.message);
}

export type Raced<T> = { timedOut: false; value: T } | { timedOut: true };

/** Resolves with the promise's value, or `{ timedOut: true }` after `ms`. The underlying promise is left running. */
export async function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<Raced<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then((value): Raced<T> => ({ timedOut: false, value })),
      new Promise<Raced<T>>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Milliseconds left of a `budgetMs` allowance that started at `startedAt`; never negative. */
export function remainingMs(startedAt: number, budgetMs: number, now: number = Date.now()): number {
  return Math.max(0, startedAt + budgetMs - now);
}
