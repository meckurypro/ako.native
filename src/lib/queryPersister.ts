// src/lib/queryPersister.ts
// Persists an ALLOW-LISTED slice of the React Query cache into the encrypted SQLite store so those lists open
// instantly (and offline) next launch, then refresh from Supabase. Everything not listed stays in memory only.
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import type { Mutation, Query } from "@tanstack/react-query";

import { OFFLINE_MUTATION_ROOTS } from "./offlineMutations";
import { secureKvDelete, secureKvGet, secureKvSet } from "./secureDb";

/**
 * Query-key roots worth showing offline. Deliberately NOT included: per-thread message pages (they hold
 * optimistic, not-yet-sent items that must never be replayed), wallet/financial data, and anything
 * one-time. Add a root here only after checking it is safe to show stale and re-hydrate cold.
 */
export const PERSISTED_QUERY_ROOTS: ReadonlySet<string> = new Set([
  "notifications",
  "page-notifications",
  "conversations",
  "archived-conversations",
  // Per-viewer booleans (heart / bookmark state): tiny, and safe to show stale. NOT "my-comment-reactions" — it holds a Map,
  // which JSON can't round-trip.
  "my-reaction",
  "is-bookmarked",
  // What a cold OFFLINE start needs in order to show anything but empty screens: the first page of each feed, and the
  // profile rows that carry the avatars. Pictures themselves live in lib/imageStore.ts.
  "feed-posts", // first page only (see shouldPersistQuery)
  "my-profile",
  "own-profile",
  "profile",
  // The bottom-nav Profile tab (/me) decides where to go from these two: who am I (username) and am I acting as a Page.
  // Small, per-user, and safe to show stale — online they refetch on mount, and a stale answer only picks the screen.
  "my-username",
  "active-identity",
  // A Page's own profile page, by username (same shape of data as "profile").
  "page",
]);

/** Roots that are bulky: dropped first when a snapshot is over budget, so small, important ones are never lost. */
const BULKY_ROOTS: ReadonlySet<string> = new Set(["feed-posts", "profile"]);

/** How long a persisted query may stay in the in-memory cache unobserved. Must be >= the persister's maxAge. */
export const PERSISTED_GC_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  const root = String(query.queryKey[0]);
  if (query.state.status !== "success" || !PERSISTED_QUERY_ROOTS.has(root)) return false;
  // Feeds are keyed [..., page]: later pages are deep-scroll state, not worth the disk — and they're stale on arrival.
  if (root === "feed-posts") return query.queryKey[query.queryKey.length - 1] === 0;
  return true;
}

/**
 * Queued writes that must survive an app kill: only paused (offline / waiting-in-scope) mutations whose key root is
 * allow-listed in OFFLINE_MUTATION_ROOTS. Every one of those is an idempotent intent, so replay is always safe.
 * Never add a mutation here unless replaying it twice is harmless (e.g. NOT "send message" without an idempotency key).
 */
export function shouldPersistMutation(mutation: Pick<Mutation, "options" | "state">): boolean {
  return (
    mutation.state.status === "pending" &&
    mutation.state.isPaused &&
    OFFLINE_MUTATION_ROOTS.has(String(mutation.options.mutationKey?.[0]))
  );
}

const CACHE_KEY = "react-query";
const WRITE_THROTTLE_MS = 2000;
const MAX_BYTES = 4 * 1024 * 1024; // a runaway cache must not bloat the DB

export interface FlushablePersister extends Persister {
  /** Write any pending snapshot now (call when the app is about to background). */
  flush: () => Promise<void>;
  /** Drop any pending snapshot without writing it (sign-out / account switch). */
  dispose: () => void;
}

export function createSqlitePersister(namespace: string): FlushablePersister {
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = async () => {
    timer = null;
    const snapshot = pending;
    pending = null;
    if (!snapshot) return;
    let json = JSON.stringify(snapshot);
    if (json.length > MAX_BYTES) {
      // Over budget: shed the bulky lists and keep the rest (small queries + queued offline writes) rather than
      // skipping the whole write, which would silently stop persisting anything at all.
      const slim: PersistedClient = {
        ...snapshot,
        clientState: { ...snapshot.clientState, queries: snapshot.clientState.queries.filter((q) => !BULKY_ROOTS.has(String(q.queryKey[0]))) },
      };
      json = JSON.stringify(slim);
      if (json.length > MAX_BYTES) return;
    }
    await secureKvSet(namespace, CACHE_KEY, json).catch(() => {});
  };

  return {
    // React Query calls this on EVERY cache change; coalesce into one trailing write.
    persistClient: (client) => {
      pending = client;
      timer ??= setTimeout(() => void write(), WRITE_THROTTLE_MS);
    },
    restoreClient: async () => {
      const raw = await secureKvGet(namespace, CACHE_KEY).catch(() => null);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as PersistedClient;
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
      await secureKvDelete(namespace, CACHE_KEY).catch(() => {});
    },
    flush: async () => {
      if (timer) clearTimeout(timer);
      await write();
    },
    dispose: () => {
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
