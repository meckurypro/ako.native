// src/lib/authOffline.ts
//
// Pure helpers for starting the app OFFLINE while signed in (no React Native imports — unit-tested in node,
// scripts/test-auth-offline.mjs).
//
// The problem: supabase-js's getSession() returns the stored session only while its access token is still valid
// (~1 hour). After that it must refresh over the network first, and if the phone is offline the refresh fails and
// getSession() returns `session: null` — which the app reads as "signed out" and sends to the login screen, a screen
// that can't work offline. Anything saved for offline use (Library → Downloads) would then be unreachable.
//
// The fix is deliberately narrow: ONLY when getSession() came back empty because the server couldn't be reached (a
// retryable network/5xx error) do we fall back to the session still sitting in encrypted storage. A session that is
// genuinely invalid (revoked, refresh token rejected) is NOT a network error, so it keeps signing the person out
// exactly as before. Once the connection is back, supabase-js's own auto-refresh swaps in a fresh token (or, if the
// server rejects the stored one, signs them out) and onAuthStateChange updates the app.
import type { Session } from "@supabase/supabase-js";

/** The key supabase-js stores the session under: `sb-<project ref>-auth-token`, the ref being the URL's first label. */
export function authStorageKey(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const ref = host.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

/** True for the error getSession() returns when it couldn't reach the server (offline, DNS, timeout, 5xx). */
export function isUnreachableError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { name?: unknown }).name === "AuthRetryableFetchError";
}

/** The stored JSON → a Session, or null if it isn't a usable one. Never throws. */
export function parseStoredSession(raw: string | null | undefined): Session | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Session> | null;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    if (typeof v.access_token !== "string" || !v.access_token) return null;
    if (typeof v.refresh_token !== "string" || !v.refresh_token) return null;
    if (!v.user || typeof v.user !== "object" || typeof v.user.id !== "string" || !v.user.id) return null;
    return v as Session;
  } catch {
    return null;
  }
}
