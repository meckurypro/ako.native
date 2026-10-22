// src/lib/guestPass.ts
// Guest Pass — a creator-minted, 6-hour link that lets anyone (signed in or not) open a project's content, private
// projects included. Mirrors the web app's lib/guestPass.ts. The token in the URL is the credential; it is validated
// server-side on every read (get_guest_pass_view) and every hosted-file request (guest-pass-file).
import { APP_URL } from "./config";

export const GUEST_PASS_HOURS = 6;

export function getGuestPassPath(token: string): string {
  return `/pass/${token}`;
}

export function getGuestPassUrl(token: string): string {
  return `${APP_URL}${getGuestPassPath(token)}`;
}

/** "5:59:10" / "42:10" — the countdown guests see. */
export function formatPassRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Only plain http(s) links are ever opened — never javascript:/data: from a database column. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}
