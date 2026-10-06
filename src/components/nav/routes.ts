// src/components/nav/routes.ts
// Which screens show the bottom nav. On web each page rendered <BottomNav />
// itself; on native there is ONE nav in the layout (so it persists across
// transitions instead of remounting), and this list is the single source of
// truth for where it appears — the same 23 pages the web showed it on.
//
// Paths are matched against expo-router's pathname (route groups removed).
const SHOWS_BOTTOM_NAV: RegExp[] = [
  /^\/feed$/,
  /^\/topics$/,
  /^\/search$/,
  /^\/hashtag\/[^/]+$/,
  /^\/post\/[^/]+$/, // PostDetail only — not /post/:id/edit
  /^\/profile\/[^/]+$/, // ProfilePage only — not followers/following
  /^\/page\/[^/]+$/, // PagePage only — not team/edit
  /^\/projects\/[^/]+$/, // ProjectDetail only
  /^\/notifications$/,
  /^\/requests$/,
  /^\/bookmarks$/,
  /^\/wallet$/,
  /^\/gigs$/,
  /^\/library$/,
  /^\/inbox$/,
  /^\/messages$/,
  /^\/messages\/archive$/,
  /^\/page-inbox$/,
  /^\/activity$/,
  /^\/activity\/(saved|liked|history|library|events)$/,
];

// "/projects/new" and "/projects/:id" look alike; "new" is the create flow.
// Page-inbox threads also hide the nav: a docked message composer can't share the bottom edge with it.
const NEVER: RegExp[] = [/^\/projects\/new$/, /^\/messages\/[^/]+$/, /^\/page-inbox\/[^/]+$/];

export function showsBottomNav(pathname: string): boolean {
  if (pathname === "/messages/archive") return true;
  if (NEVER.some((r) => r.test(pathname))) return false;
  return SHOWS_BOTTOM_NAV.some((r) => r.test(pathname));
}

export type NavKey = "feed" | "topics" | "library" | "messages" | "profile";

export const NAV_PATH: Record<NavKey, string> = {
  feed: "/feed",
  topics: "/topics",
  library: "/library",
  messages: "/inbox", // redirect route: /messages or /page-inbox depending on identity
  profile: "/me", // redirect route: own profile or the active Page
};
