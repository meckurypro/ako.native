// src/hooks/useRouteMemory.ts
// "Return to where you left": remembers the screen the person is on, and puts them back there when the app
// cold-starts.
//
// While the app is merely backgrounded, the navigator keeps its state and nothing is needed. But Android kills
// backgrounded apps freely (low memory, aggressive OEM battery managers — common on the phones we ship to),
// and a cold start begins at `/` → the Feed. So every navigation is written to local storage (a synchronous
// sqlite-backed key-value store — see lib/polyfills.ts), and on a cold start we push the saved screen on top of
// the Feed, so Back still lands somewhere sensible.
//
// Rules:
//   • restore only when the app was opened normally — never over a deep link or a notification tap
//   • restore only the same user's route, and only if it is recent (MAX_AGE_MS)
//   • screens with unsaved/transient state (composers, create flows, live calls, payment returns) are never
//     remembered; the last *other* screen is kept instead
//   • restore happens once per process, and only if nobody has navigated away from the landing screen yet
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { router, useGlobalSearchParams, usePathname, type Href } from "expo-router";
import { useEffect, useRef } from "react";

const KEY = "ako-last-route";
/** Older than this, the person has "left" — a fresh start at the Feed is the right landing. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Screens that must not be restored: their state lives in memory and an empty one would be confusing. */
const TRANSIENT: RegExp[] = [
  /^\/$/,
  /^\/create$/,
  /^\/compose$/,
  /^\/promote(\/|$)/,
  /^\/projects\/new$/,
  /^\/projects\/[^/]+\/edit$/,
  /^\/post\/[^/]+\/edit$/,
  /^\/page\/new$/,
  /^\/page\/[^/]+\/edit$/,
  /^\/meetings\//, // a live call
  /^\/wallet\/deposit\/callback$/,
  /^\/auth\//,
  /^\/onboarding(\/|$)/,
  /^\/login$|^\/signup$|^\/verify-email$|^\/reset-password$/,
];

interface Saved {
  uid: string;
  href: string;
  ts: number;
}

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Saved;
    return v && typeof v.uid === "string" && typeof v.href === "string" && typeof v.ts === "number" ? v : null;
  } catch {
    return null;
  }
}

function write(v: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* a failed write just means a cold start lands on the Feed */
  }
}

/** Forget the remembered screen — on sign-out, so the next person never lands on someone else's page. */
export function clearRouteMemory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function hrefFor(pathname: string, params: Record<string, string | string[] | undefined>): string {
  const qs = Object.entries(params)
    // Skip `ref` (an affiliate token, consumed once) and the dynamic-segment params already spelled out in the path.
    .filter(([k, v]) => v !== undefined && v !== "" && k !== "ref" && !(typeof v === "string" && pathname.split("/").includes(encodeURIComponent(v))))
    .flatMap(([k, v]) => (Array.isArray(v) ? v : [v as string]).map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(x)}`))
    .join("&");
  return qs ? `${pathname}?${qs}` : pathname;
}

/** @param userId signed-in user (route memory is per user) */
export function useRouteMemory(userId: string | undefined) {
  const pathname = usePathname();
  const params = useGlobalSearchParams<Record<string, string | string[]>>();

  // Read BEFORE any save below overwrites it with the landing screen.
  const saved = useRef<Saved | null | undefined>(undefined);
  if (saved.current === undefined) saved.current = read();
  const decided = useRef(false);
  const initialPathname = useRef(pathname);
  /** True from launch until the restore has pushed (or been ruled out) — the landing screen must not overwrite the saved one meanwhile. */
  const restorePending = useRef(false);

  // One decision per process: restore, or give up for good.
  useEffect(() => {
    if (decided.current || !userId) return;
    decided.current = true;
    const candidate = saved.current;
    const eligible =
      !!candidate &&
      candidate.uid === userId &&
      Date.now() - candidate.ts <= MAX_AGE_MS &&
      !TRANSIENT.some((r) => r.test(candidate.href.split("?")[0])) &&
      candidate.href.split("?")[0] !== initialPathname.current;
    restorePending.current = eligible;

    (async () => {
      if (!eligible || !candidate) return;
      try {
        // Opened from a link or a notification: that destination wins.
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && !/^[a-z][a-z0-9+.-]*:\/\/\/?$/i.test(initialUrl)) return;
        if (Notifications.getLastNotificationResponse()) return;
      } catch {
        /* can't tell: restoring is the safer default for a plain launch */
      }
      router.push(candidate.href as Href);
    })().finally(() => {
      restorePending.current = false;
    });
  }, [userId]);

  // Remember where we are. Held back until the restore decision above has read the old value.
  useEffect(() => {
    if (!userId || !decided.current) return;
    if (TRANSIENT.some((r) => r.test(pathname))) return;
    if (restorePending.current && pathname === initialPathname.current) return;
    write({ uid: userId, href: hrefFor(pathname, params), ts: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pathname, JSON.stringify(params)]);
}
