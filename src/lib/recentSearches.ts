// src/lib/recentSearches.ts
//
// "Recent searches" for the Discover search screen — the list TikTok and
// every other social app shows the moment you tap the search bar.
//
// Same approach as searchVisits.ts, and for the same reasons: a per-device,
// per-user list kept in localStorage (polyfilled on native), not a Supabase
// table. It's a convenience, not data that needs to sync or survive a
// reinstall, and scoping the key by user id keeps one account's history out
// of another's on a shared device.

const MAX_ENTRIES = 12;
const MAX_TERM_LENGTH = 80;
const MIN_TERM_LENGTH = 2;

function storageKey(userId: string): string {
  return `ako:recent-searches:${userId}`;
}

function normalize(term: string): string {
  return term.replace(/\s+/g, " ").trim().slice(0, MAX_TERM_LENGTH);
}

function write(userId: string, list: string[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(list));
  } catch {
    // Storage full/unavailable — the term just won't be remembered.
  }
}

/** Most-recent-first list of this user's recent search terms. */
export function getRecentSearches(userId: string | null | undefined): string[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string").slice(0, MAX_ENTRIES)
      : [];
  } catch {
    // Corrupt entry or storage unavailable — degrade to "no history".
    return [];
  }
}

/** Move `term` to the front (case-insensitive dedupe). Returns the new list. */
export function addRecentSearch(userId: string | null | undefined, term: string): string[] {
  const clean = normalize(term);
  const existing = getRecentSearches(userId);
  if (!userId || clean.length < MIN_TERM_LENGTH) return existing;
  const next = [clean, ...existing.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_ENTRIES);
  write(userId, next);
  return next;
}

/** Remove a single term. Returns the new list. */
export function removeRecentSearch(userId: string | null | undefined, term: string): string[] {
  const existing = getRecentSearches(userId);
  if (!userId) return existing;
  const next = existing.filter((t) => t.toLowerCase() !== term.toLowerCase());
  write(userId, next);
  return next;
}

/** Forget everything for this user. */
export function clearRecentSearches(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing to do — storage unavailable.
  }
}
