// src/lib/authRedirect.ts
// Carries a signed-out visitor's intended destination (e.g. a shared project
// slug opened via deep link) through login / sign-up / email confirmation /
// onboarding, so they land there instead of on the feed. Mirrors the web
// app's src/lib/authRedirect.ts.
//
// Only same-app absolute paths are honoured (no open redirects). The pending
// destination is a plain path — non-sensitive — so the plaintext localStorage
// polyfill is fine for it (see lib/polyfills.ts).

const STORAGE_KEY = "ako.return_to.v1";
const AUTH_PREFIXES = ["/login", "/signup", "/verify-email", "/reset-password", "/auth"];
// Account-management screens are never somewhere a login should drop you (see the web authRedirect).
const NEVER_RETURN_PREFIXES = ["/settings"];

export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (raw === "/") return null;
  if (AUTH_PREFIXES.some((p) => raw === p || raw.startsWith(`${p}?`) || raw.startsWith(`${p}/`))) return null;
  if (NEVER_RETURN_PREFIXES.some((p) => raw === p || raw.startsWith(`${p}?`) || raw.startsWith(`${p}/`))) return null;
  return raw;
}

export function rememberReturnTo(path: string | null | undefined): void {
  const safe = safeReturnPath(path);
  if (!safe) return;
  try {
    localStorage.setItem(STORAGE_KEY, safe);
  } catch {
    // Storage unavailable — falls back to /feed, nothing else is lost.
  }
}

/** Reads and clears the remembered destination (one-shot). */
export function takeReturnTo(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    return safeReturnPath(value);
  } catch {
    return null;
  }
}
