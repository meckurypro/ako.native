// src/lib/customPageSlugs.ts
// Custom Pages share the flat /<slug> namespace with Projects, and a Project page shows the bottom nav while a Custom
// Page is its own website with no app chrome. The nav decides from the pathname alone, so this remembers which slugs
// have turned out to be Custom Pages (set by SlugRoute once it has looked one up) and keeps that across launches so the
// nav never flashes on a page the person has opened before. Plain slugs only — non-sensitive, so plaintext storage is fine.
import { useSyncExternalStore } from "react";

const KEY = "ako:cp-slugs";
const MAX = 100;

let known: string[] | null = null;
let version = 0;
const listeners = new Set<() => void>();

function load(): string[] {
  if (known) return known;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    known = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    known = [];
  }
  return known;
}

function commit(next: string[]) {
  known = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Best-effort: without storage the nav simply flashes once per launch.
  }
  version += 1;
  listeners.forEach((l) => l());
}

export function isKnownCustomPageSlug(slug: string): boolean {
  return load().includes(slug.toLowerCase());
}

export function rememberCustomPageSlug(slug: string): void {
  const s = slug.toLowerCase();
  if (isKnownCustomPageSlug(s)) return;
  commit([...load(), s].slice(-MAX));
}

/** The slug turned out not to be a Custom Page (any more) — it is a Project's again. */
export function forgetCustomPageSlug(slug: string): void {
  const s = slug.toLowerCase();
  if (!isKnownCustomPageSlug(s)) return;
  commit(load().filter((x) => x !== s));
}

/** Re-renders the caller whenever the known set changes, so nav visibility follows it. Returns the version. */
export function useCustomPageSlugsVersion(): number {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    () => version,
    () => 0
  );
}
