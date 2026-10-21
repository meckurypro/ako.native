// src/lib/followCache.ts
// Instant-UI helpers for follow / unfollow / follow-request actions. No React, no Supabase. Identical copy lives in
// the native repo — keep the two in sync.
//
// WHY THIS EXISTS: follow state used to change only after the write finished AND the follow queries refetched, so
// the button, the Followers/Following numbers and the lists all lagged one or two round trips behind the tap. These
// helpers write the EXPECTED result straight into every cached copy (button state, profile counters, follower /
// following lists) the moment the user taps, hand back a snapshot, and restore it if the write is rejected.
import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { patchCounter } from "./optimisticCache";

/** [queryKey, previousData] pairs — what to put back if the write fails. */
export type FollowSnapshot = Array<[QueryKey, unknown]>;

// Postgres unique_violation: the follow / request is already there, which is exactly the state we wanted.
export const UNIQUE_VIOLATION = "23505";

/** Query-key roots whose cached rows carry follower_count / following_count on a profile (`id` + counters). */
const PROFILE_COUNT_ROOTS: ReadonlySet<string> = new Set(["profile"]);
/** …and on a page (`id` + follower_count). */
const PAGE_COUNT_ROOTS: ReadonlySet<string> = new Set(["page", "page-by-id"]);

function remember(snap: FollowSnapshot, key: QueryKey, data: unknown) {
  // Keep only the FIRST snapshot of a key, so several writes to one key in a single action roll back to the original.
  if (!snap.some(([k]) => JSON.stringify(k) === JSON.stringify(key))) snap.push([key, data]);
}

/** Sets one cached value (a boolean flag, a list…) and remembers what was there. */
export function setCached<T>(qc: QueryClient, snap: FollowSnapshot, key: QueryKey, value: T): void {
  remember(snap, key, qc.getQueryData(key));
  qc.setQueryData(key, value);
}

/** Adds `delta` to `field` on entity `id` in every cached query under `roots` (floored at 0). */
function adjust(qc: QueryClient, snap: FollowSnapshot, roots: ReadonlySet<string>, id: string, field: string, delta: number) {
  if (!id || delta === 0) return;
  for (const query of qc.getQueryCache().findAll()) {
    if (!roots.has(String(query.queryKey[0]))) continue;
    const data = query.state.data;
    if (data === undefined) continue;
    const next = patchCounter(data, id, field, delta);
    if (next === data) continue;
    remember(snap, query.queryKey, data);
    // A local patch, not new server data: keep the original freshness so a normal refetch still reconciles.
    qc.setQueryData(query.queryKey, next, { updatedAt: query.state.dataUpdatedAt });
  }
}

export const adjustProfileCount = (
  qc: QueryClient,
  snap: FollowSnapshot,
  profileId: string,
  field: "follower_count" | "following_count",
  delta: number
) => adjust(qc, snap, PROFILE_COUNT_ROOTS, profileId, field, delta);

export const adjustPageFollowers = (qc: QueryClient, snap: FollowSnapshot, pageId: string, delta: number) =>
  adjust(qc, snap, PAGE_COUNT_ROOTS, pageId, "follower_count", delta);

type Row = { id: string };

/**
 * Finds a person's profile row anywhere in the cache (a profile page, a Followers/Following list, the signed-in
 * user's own slice) so it can be dropped into a list without a fetch. Undefined when it was never loaded.
 */
export function findCachedProfile<T extends Row = Row>(qc: QueryClient, id: string): T | undefined {
  for (const query of qc.getQueryCache().findAll()) {
    const root = String(query.queryKey[0]);
    const data = query.state.data as unknown;
    if (!data) continue;
    if (root === "profile" || root === "my-profile") {
      if ((data as Row).id === id) return data as T;
    } else if (root === "followers" || root === "following") {
      if (Array.isArray(data)) {
        const hit = data.find((p) => p && (p as Row).id === id);
        if (hit) return hit as T;
      }
    }
  }
  return undefined;
}

/**
 * Adds / removes one person in a Followers or Following list. The key is exactly ["followers"|"following", ownerId]
 * — ["following", "pages", ownerId] (the pages a person follows) is a different list and is left alone.
 */
export function setInPeopleList(
  qc: QueryClient,
  snap: FollowSnapshot,
  list: "followers" | "following",
  ownerId: string,
  person: Row | undefined,
  personId: string,
  present: boolean
): void {
  if (!ownerId) return;
  const key: QueryKey = [list, ownerId];
  const current = qc.getQueryData<Row[]>(key);
  if (!Array.isArray(current)) return;
  const has = current.some((p) => p?.id === personId);
  if (present && !has && person) {
    setCached(qc, snap, key, [person, ...current]);
  } else if (!present && has) {
    setCached(qc, snap, key, current.filter((p) => p?.id !== personId));
  }
}

export function restoreSnapshot(qc: QueryClient, snap: FollowSnapshot | undefined): void {
  if (!snap) return;
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

/**
 * Turns a failed follow-family write into one short, human sentence. Row-level-security rejections are the
 * account-review gate (pending accounts can't follow yet); the page guards raise their own readable messages.
 */
export function friendlyFollowError(error: unknown, fallback = "Couldn't update that. Please try again."): string {
  const e = error as { code?: string; message?: string } | null;
  const message = (e?.message ?? "").trim();
  if (/row-level security/i.test(message)) return "Following isn't available on your account yet.";
  if (/request not found/i.test(message)) return "That request is no longer available.";
  if (/not authorized/i.test(message)) return "You can't do that.";
  // Our own readable guard messages (e.g. "Pages can't follow other pages…") — show them as written.
  if (e?.code === "42501" && message) return message;
  if (/failed to fetch|network|timeout/i.test(message)) return "No connection. Check your network and try again.";
  return fallback;
}

/** Transient failures (no network, 5xx) are retried briefly; a database rejection (RLS, constraint) is final. */
export function retryTransientOnly(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const code = (error as { code?: unknown } | null)?.code;
  return !code; // PostgREST errors carry a code; network failures don't
}
