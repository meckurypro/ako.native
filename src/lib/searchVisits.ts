// src/lib/searchVisits.ts
//
// Item 2: "when a user searches for an account in the discover page and
// visits the account, when they next come back to discover to search,
// the account should be listed at the top of the listed accounts."
//
// This is a per-device, per-user "recently visited from search" list —
// deliberately client-side (localStorage) rather than a Supabase table,
// since it's a lightweight personalization signal (like recent-searches
// on most apps), not data that needs to sync across devices or survive
// a reinstall. Scoped by user id so a shared/borrowed device doesn't mix
// one account's visit history into another's results.

const MAX_ENTRIES = 50;

function storageKey(userId: string): string {
  return `ako:search-visits:${userId}`;
}

/** Most-recently-visited-first list of profile ids for this user. */
export function getSearchVisits(userId: string | null | undefined): string[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    // Corrupt entry or storage unavailable (private browsing, quota) —
    // degrade to "no history" rather than throwing.
    return [];
  }
}

/** Record a visit, moving `profileId` to the front (deduping any earlier entry). */
export function recordSearchVisit(userId: string | null | undefined, profileId: string): void {
  if (!userId || !profileId) return;
  try {
    const existing = getSearchVisits(userId).filter((id) => id !== profileId);
    const next = [profileId, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Storage full/unavailable — visit just won't be remembered this time.
  }
}

/** Map of profileId -> recency rank (0 = most recent), for O(1) score lookups. */
export function getSearchVisitRanks(userId: string | null | undefined): Map<string, number> {
  const ranks = new Map<string, number>();
  getSearchVisits(userId).forEach((id, index) => ranks.set(id, index));
  return ranks;
}
