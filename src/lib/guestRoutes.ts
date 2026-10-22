// src/lib/guestRoutes.ts
// Signed-out visitors may open exactly one kind of screen: a project's own page, reached through a shared link
// (https://<web-domain>/:slug, https://<web-domain>/projects/:id, or the ako:// equivalents). Everything else in the
// (app) group stays behind sign-in. Keep in step with the web app, where the same page renders for guests.
import { RESERVED_PROJECT_SLUGS } from "@/lib/projectLinks";

// Top-level routes that exist in the app but are not in the server-side reserved-slug list.
const EXTRA_APP_SEGMENTS = new Set(["connect"]);
const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True for /pass/:token — a Guest Pass link (creator-minted, 6 hours, works for private projects too). */
export function isGuestPassPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const parts = (pathname.split(/[?#]/)[0] ?? "").split("/").filter(Boolean);
  return parts.length === 2 && parts[0] === "pass";
}

/** True for /projects/:id and /:slug (a custom project link) — never for /projects/new, /projects/:id/edit, /feed, … */
export function isGuestProjectPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (isGuestPassPath(pathname)) return true;
  const path = pathname.split(/[?#]/)[0] ?? "";
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 2 && parts[0] === "projects") return parts[1] !== "new";

  if (parts.length === 1) {
    const slug = parts[0]!.toLowerCase();
    return SLUG_SHAPE.test(slug) && !RESERVED_PROJECT_SLUGS.has(slug) && !EXTRA_APP_SEGMENTS.has(slug);
  }
  return false;
}
