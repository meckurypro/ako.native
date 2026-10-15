// src/lib/refresh.ts
// Pure (no React Native imports) logic behind pull-to-refresh, so it can be unit-tested in node
// (scripts/test-refresh.mjs) and shared by usePullToRefresh, PostList and the Feed tabs.
import type { QueryClient } from "@tanstack/query-core";

/** A refresh must never hang the spinner (a refetch that pauses on a flaky connection never settles). */
export const REFRESH_CAP_MS = 12_000;
/** How long we wait for NetInfo's reachability re-probe before letting the request itself decide. */
export const PROBE_TIMEOUT_MS = 3_000;

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), ms)))]).finally(() => clearTimeout(timer));
}

export interface NetProbeResult {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}

/**
 * Should a user-initiated pull try the network? Only a definite "not connected" says no.
 *
 * NetInfo's `isInternetReachable` is the result of a probe against a third-party URL (Google's generate_204 by
 * default), and it is routinely false/stale on flaky or filtered networks even though our own API is fine. React
 * Query pauses every refetch while it believes it is offline — so letting that flag veto a pull made the spinner
 * run with nothing happening. The user explicitly asked for fresh data: try, and let the request succeed or fail.
 */
export async function isOnlineForRefresh(probe: () => Promise<NetProbeResult | null>): Promise<boolean> {
  const state = await withTimeout(probe().catch(() => null), PROBE_TIMEOUT_MS, null);
  if (!state) return true; // couldn't tell (slow / failed probe) — let the request decide
  return state.isConnected !== false;
}

export type RefreshOutcome = "refreshed" | "offline" | "timeout";

export interface RefreshDeps {
  queryClient: Pick<QueryClient, "getMutationCache" | "refetchQueries">;
  /** onlineManager.setOnline — told the truth on every pull so a stale "offline" flag can't pause the refetches. */
  setOnline: (online: boolean) => void;
  probe: () => Promise<NetProbeResult | null>;
}

/** True while offline-first writes (likes, saves…) are queued or in flight. */
export function hasQueuedWrites(queryClient: Pick<QueryClient, "getMutationCache">): boolean {
  return queryClient.getMutationCache().getAll().some((m) => m.state.isPaused || m.state.status === "pending");
}

/**
 * Runs one pull-to-refresh: re-probes connectivity, runs every caller refetch (plus, optionally, every other
 * query currently on screen), and resolves when they all settle — or after the cap, so the spinner can't stick.
 */
export async function runRefresh(
  fns: Array<() => Promise<unknown> | unknown>,
  opts: { refetchActive: boolean; capMs?: number },
  deps: RefreshDeps
): Promise<RefreshOutcome> {
  const online = await isOnlineForRefresh(deps.probe);
  deps.setOnline(online);
  if (!online) return "offline"; // genuinely offline: cached data stays, queries resync on reconnect

  const all: Promise<unknown>[] = fns.map((fn) => Promise.resolve().then(fn));
  // Skipped while queued writes exist so a refetch can't overwrite an optimistic value the server hasn't received yet.
  if (opts.refetchActive && !hasQueuedWrites(deps.queryClient)) all.push(deps.queryClient.refetchQueries({ type: "active" }));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), opts.capMs ?? REFRESH_CAP_MS)));
  try {
    // allSettled: one failing query must never leave the spinner stuck; the cap covers one that never settles.
    return await Promise.race([Promise.allSettled(all).then(() => "refreshed" as const), cap]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ───────────────────────── paged feeds ─────────────────────────
// Feed queries are keyed [root, kind, id, page] (see hooks/usePosts.ts, hooks/usePageFeed.ts).
const FEED_ROOTS: ReadonlySet<string> = new Set(["feed-posts", "page-feed-posts"]);

function feedPageOf(queryKey: readonly unknown[]): number | null {
  if (!FEED_ROOTS.has(String(queryKey[0]))) return null;
  const last = queryKey[queryKey.length - 1];
  return typeof last === "number" ? last : null;
}

export const isDeeperFeedPage = (queryKey: readonly unknown[]): boolean => (feedPageOf(queryKey) ?? 0) > 0;
export const isFirstFeedPage = (queryKey: readonly unknown[]): boolean => feedPageOf(queryKey) === 0;

/**
 * Refresh a paged feed. At the top it's just a refetch. From deeper in the feed (the user scrolled, loaded more
 * pages, scrolled back up and pulled) a bare `setPage(0)` ended the spinner instantly and showed the CACHED first page —
 * old posts — while the real fetch ran unseen. Instead: mark the cached deeper pages stale (kept for instant display,
 * refetched when scrolled to), jump to page 0, and hold the spinner until a FRESH first page has landed.
 */
export async function refreshFeedPages(args: {
  queryClient: Pick<QueryClient, "invalidateQueries" | "refetchQueries">;
  /** Key prefix of THIS tab's feed, without the page: e.g. ["feed-posts", "ranked", userId]. */
  prefix: readonly unknown[];
  page: number;
  setPage: (page: number) => void;
  refetch: () => Promise<unknown> | unknown;
  /** Other queries that must refresh with the feed (e.g. a pinned post). */
  extra?: Array<() => Promise<unknown> | unknown>;
}): Promise<void> {
  const { queryClient, prefix, page, setPage, refetch, extra = [] } = args;
  const work: Array<Promise<unknown>> = extra.map((fn) => Promise.resolve().then(fn));
  if (page === 0) {
    work.push(Promise.resolve().then(refetch));
  } else {
    await queryClient.invalidateQueries({ queryKey: prefix as unknown[], predicate: (q) => isDeeperFeedPage(q.queryKey), refetchType: "none" });
    setPage(0);
    work.push(queryClient.refetchQueries({ queryKey: prefix as unknown[], predicate: (q) => isFirstFeedPage(q.queryKey) }));
  }
  await Promise.allSettled(work);
}

// ───────────────────────── accumulated pages ─────────────────────────
/**
 * Flatten pages in order, dropping repeats by id (first occurrence wins). Ranked feeds page by offset, so when the
 * ranking shifts between two page loads the same post can come back on both — a duplicate key in the list.
 */
export function mergePages<T extends { id: string }>(pages: Readonly<Record<number, readonly T[]>>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const key of Object.keys(pages).map(Number).sort((a, b) => a - b)) {
    for (const item of pages[key]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
