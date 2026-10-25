// src/components/nav/routes.ts
// Which screens show the bottom nav. On web each page rendered <BottomNav />
// itself; on native there is ONE nav in the layout (so it persists across
// transitions instead of remounting), and this list is the single source of
// truth for where it appears — the pages the web showed it on.
//
// Paths are matched against expo-router's pathname (route groups removed).
import { isKnownCustomPageSlug } from "@/lib/customPageSlugs";
import { isReservedProjectSlug, isValidProjectSlugFormat, normalizeProjectSlug } from "@/lib/projectLinks";

const SHOWS_BOTTOM_NAV: RegExp[] = [
  /^\/feed$/,
  /^\/topics$/,
  /^\/search$/,
  /^\/hashtag\/[^/]+$/,
  /^\/post\/[^/]+$/, // PostDetail only — not /post/:id/edit
  /^\/post\/[^/]+\/comment\/[^/]+$/, // an opened comment
  /^\/profile\/[^/]+$/, // ProfilePage only — not followers/following
  /^\/page\/[^/]+$/, // PagePage only — not team/edit
  /^\/projects\/[^/]+$/, // ProjectDetail only
  /^\/notifications$/,
  /^\/requests$/,
  /^\/bookmarks$/,
  /^\/wallet$/,
  /^\/wallet\/affiliate-links$/, // Forked projects (web shows the nav here too)
  /^\/activity\/affiliates$/, // …and its Activity entry point, same screen
  /^\/gigs$/,
  /^\/library$/,
  /^\/me\/custom-pages$/, // Custom pages list (the create flow, editor and manage screens are full-screen)
  /^\/me$/, // the Profile tab's redirect screen — keeps the nav up while it resolves instead of a bare blank screen
  /^\/connect$/,
  /^\/inbox$/,
  /^\/messages$/,
  /^\/messages\/archive$/,
  /^\/page-inbox$/,
  /^\/activity$/,
  /^\/activity\/(saved|liked|history|library)$/,
];

// "/projects/new" and "/projects/:id" look alike; "new" is the create flow.
// Page-inbox threads also hide the nav: a docked message composer can't share the bottom edge with it.
const NEVER: RegExp[] = [/^\/projects\/new$/, /^\/messages\/[^/]+$/, /^\/page-inbox\/[^/]+$/];

/**
 * A project's pretty public address — "/my-file" (see lib/projectLinks). It renders the same ProjectDetail as
 * "/projects/:id", so it gets the same nav. Any single-segment path that is a valid, non-reserved slug is one:
 * reserved words are exactly the app's own top-level routes (settings, compose, login…), which is why a slug can
 * never shadow them.
 */
function isProjectSlugPath(pathname: string): boolean {
  const match = /^\/([^/]+)$/.exec(pathname);
  if (!match) return false;
  const slug = normalizeProjectSlug(match[1]); // the screen resolves slugs case-insensitively, so must this
  // A slug that turned out to be a Custom Page is its own website: no app nav (see lib/customPageSlugs).
  return isValidProjectSlugFormat(slug) && !isReservedProjectSlug(slug) && !isKnownCustomPageSlug(slug);
}

export function showsBottomNav(pathname: string): boolean {
  if (pathname === "/messages/archive") return true;
  if (NEVER.some((r) => r.test(pathname))) return false;
  return SHOWS_BOTTOM_NAV.some((r) => r.test(pathname)) || isProjectSlugPath(pathname);
}

export type NavKey = "feed" | "topics" | "library" | "connect" | "messages" | "profile";

export const NAV_PATH: Record<NavKey, string> = {
  feed: "/feed",
  topics: "/topics",
  library: "/library",
  connect: "/connect", // Events · Meetings · Rooms · Affiliates
  messages: "/inbox", // redirect route: /messages or /page-inbox depending on identity
  profile: "/me", // redirect route: own profile or the active Page
};
