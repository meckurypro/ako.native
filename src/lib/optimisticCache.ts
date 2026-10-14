// src/lib/optimisticCache.ts
// Pure helpers for adjusting a counter (like_count, …) on one entity everywhere it is cached, without a refetch.
// No React, no Supabase — unit-tested in scripts/test-optimistic.mjs. Identical copy lives in the web repo.
import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Query-key roots whose cached data can contain post rows (arrays, single rows, or rows nested in pages/joins). */
export const POST_QUERY_ROOTS: ReadonlySet<string> = new Set([
  "feed-posts",
  "page-feed-posts",
  "user-posts",
  "page-posts",
  "hashtag-posts",
  "search-posts",
  "post-full",
  "post",
  "liked-posts",
  "bookmarked-posts",
]);

/** Same, for project rows. */
export const PROJECT_QUERY_ROOTS: ReadonlySet<string> = new Set([
  "user-projects",
  "project",
  "project-detail",
  "similar-projects",
  "saved-projects",
  "liked-projects",
]);

/** Comment rows (top level + replies). */
export const COMMENT_QUERY_ROOTS: ReadonlySet<string> = new Set(["comments", "comment-replies"]);

const MAX_DEPTH = 6;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Returns `node` with `field` on every object whose `id === id` adjusted by `delta` (floored at 0).
 * Structural sharing: if nothing matched, the SAME reference comes back, so callers can detect "no change"
 * and React Query/React skip re-renders for untouched queries.
 */
export function patchCounter(node: unknown, id: string, field: string, delta: number, depth = 0): unknown {
  if (depth > MAX_DEPTH || delta === 0) return node;

  if (Array.isArray(node)) {
    let changed = false;
    const out = node.map((item) => {
      const next = patchCounter(item, id, field, delta, depth + 1);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : node;
  }

  if (isPlainObject(node)) {
    let changed = false;
    let out: Record<string, unknown> = node;
    if (node.id === id && typeof node[field] === "number") {
      out = { ...node, [field]: Math.max(0, (node[field] as number) + delta) };
      changed = true;
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (child === null || typeof child !== "object") continue;
      const next = patchCounter(child, id, field, delta, depth + 1);
      if (next !== child) {
        if (out === node) out = { ...node };
        out[key] = next;
        changed = true;
      }
    }
    return changed ? out : node;
  }

  return node;
}

export interface AdjustCountOptions {
  roots: ReadonlySet<string>;
  id: string;
  field: string;
  delta: number;
  /**
   * When the user acted. A query whose data arrived AFTER this may already include the server-side effect, so
   * patching it would double-count; those are refetched instead of patched.
   */
  queuedAt: number;
}

/**
 * Applies the delta to every matching cached query. Returns the keys that were refetched rather than patched.
 */
export function adjustCountInCaches(qc: QueryClient, { roots, id, field, delta, queuedAt }: AdjustCountOptions): QueryKey[] {
  const refetch: QueryKey[] = [];
  if (delta === 0) return refetch;

  for (const query of qc.getQueryCache().findAll()) {
    if (!roots.has(String(query.queryKey[0]))) continue;
    const data = query.state.data;
    if (data === undefined) continue;
    const next = patchCounter(data, id, field, delta);
    if (next === data) continue; // this query doesn't contain the entity

    if (query.state.dataUpdatedAt >= queuedAt) {
      refetch.push(query.queryKey); // ambiguous — ask the server instead of guessing
    } else {
      // Keep the original freshness timestamp: this is a local patch, not new server data.
      qc.setQueryData(query.queryKey, next, { updatedAt: query.state.dataUpdatedAt });
    }
  }

  for (const queryKey of refetch) void qc.invalidateQueries({ queryKey, exact: true });
  return refetch;
}
