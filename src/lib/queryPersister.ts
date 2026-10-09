// src/lib/queryPersister.ts
// Persists an ALLOW-LISTED slice of the React Query cache into the encrypted SQLite store so those lists open
// instantly (and offline) next launch, then refresh from Supabase. Everything not listed stays in memory only.
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import type { Query } from "@tanstack/react-query";

import { secureKvDelete, secureKvGet, secureKvSet } from "./secureDb";

/**
 * Query-key roots worth showing offline. Deliberately NOT included: per-thread message pages (they hold
 * optimistic, not-yet-sent items that must never be replayed), wallet/financial data, and anything
 * one-time. Add a root here only after checking it is safe to show stale and re-hydrate cold.
 */
export const PERSISTED_QUERY_ROOTS: ReadonlySet<string> = new Set(["notifications", "page-notifications", "conversations", "archived-conversations"]);

export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  return query.state.status === "success" && PERSISTED_QUERY_ROOTS.has(String(query.queryKey[0]));
}

const CACHE_KEY = "react-query";
const WRITE_THROTTLE_MS = 2000;
const MAX_BYTES = 2 * 1024 * 1024; // a runaway cache must not bloat the DB

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
    const json = JSON.stringify(snapshot);
    if (json.length > MAX_BYTES) return;
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
