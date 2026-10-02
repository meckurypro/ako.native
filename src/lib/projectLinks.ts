// src/lib/projectLinks.ts
import { APP_URL } from "./config";
//
// Canonical project-link architecture. See
// AKO_CUSTOM_PROJECT_LINKS_AND_PUBLIC_SLUGS.md for the full spec this
// implements.
//
// A project's public address is a flat, global custom URL:
//
//   /:slug
//
// falling back to the immutable id-based route:
//
//   /projects/:id
//
// whenever a slug hasn't been set yet. The id route is never removed
// or deprecated; it's the thing the slug is always an alias *for*,
// and it's what every internal "go straight to this project"
// navigation (notifications, library, edit, ticket scan,
// post-purchase redirects, etc.) keeps using on purpose — those
// aren't public/shareable links, so there's no reason for them to
// depend on a slug existing.
//
// Slugs are unique GLOBALLY, not per-creator — /calling belongs to
// exactly one project on all of Ako, the same way a username does.
// See the global_project_slugs migration.
//
// This file is the ONLY place that should ever construct a project's
// public path. Adding a new project type never requires touching
// this file — /projects/:id already renders any project_type via
// ProjectDetail/ProjectCard, so a new type gets a working canonical
// link for free the moment it has a row in `projects`.
//
// Kept in sync with the server: is_reserved_project_slug() and the
// format check in set_project_slug() (see the global_project_slugs
// migration). The server is what actually enforces this — this copy
// exists purely so the UI can validate as the user types without a
// round trip.

const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Mirrors is_reserved_project_slug() in Postgres. Not a security
// boundary (the unique index is) — just keeps a custom URL from
// shadowing one of the app's own top-level routes (e.g. "settings",
// "feed"), since a slug now lives at the same flat level as those.
export const RESERVED_PROJECT_SLUGS = new Set([
  "new", "edit", "delete", "settings", "admin", "login", "signup", "logout",
  "api", "app", "www", "null", "undefined", "me", "support", "help", "about",
  "terms", "privacy", "followers", "following", "team", "create", "projects",
  "project", "profile", "page", "pages", "wallet", "messages", "message",
  "notifications", "feed", "search", "explore", "activity", "archive",
  "saved", "liked", "library",
  "verify-email", "reset-password", "auth", "onboarding", "compose",
  "promote", "hashtag", "topics", "post", "requests", "bookmarks", "inbox",
  "page-inbox", "rooms", "courses", "books", "meetings", "gigs",
  "saved-projects", "settings-advanced", "settings-appearance",
]);

export function normalizeProjectSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidProjectSlugFormat(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 60 && SLUG_FORMAT.test(slug);
}

export function isReservedProjectSlug(slug: string): boolean {
  return RESERVED_PROJECT_SLUGS.has(slug);
}

// A single combined check for inline field validation — returns why a
// slug can't be used, or null if the format/reserved-word gate
// passes. Availability (is someone else already using it) is a
// separate, server-checked concern — see useCheckProjectSlugAvailable
// in useProjects.ts.
export function getProjectSlugFormatError(rawSlug: string): string | null {
  const slug = normalizeProjectSlug(rawSlug);
  if (slug.length < 3) return "Must be at least 3 characters.";
  if (slug.length > 60) return "Must be 60 characters or fewer.";
  if (!SLUG_FORMAT.test(slug)) {
    return "Only lowercase letters, numbers, and single hyphens between them.";
  }
  if (isReservedProjectSlug(slug)) return "That link is reserved. Please choose another.";
  return null;
}

/**
 * The path portion of a project's canonical public link. Degrades
 * gracefully to the immutable id-based route when no slug is set,
 * which always works regardless of project_type.
 */
export function getProjectPath(project: { id: string; slug?: string | null }): string {
  if (project.slug) {
    return `/${project.slug}`;
  }
  return `/projects/${project.id}`;
}

export function getProjectUrl(project: { id: string; slug?: string | null }): string {
  return `${APP_URL}${getProjectPath(project)}`;
}
