// src/lib/authLink.ts
// Native handling of Supabase email links (sign-up confirmation, password
// recovery). On web supabase-js reads the tokens out of the page URL itself
// (detectSessionInUrl); on native that is off, so the /auth/callback screen
// receives the deep link and completes the session here.
//
// Supabase delivers one of two shapes depending on the project's flow:
//   implicit : ako://auth/callback#access_token=…&refresh_token=…&type=signup
//   PKCE     : ako://auth/callback?code=…
// Errors arrive as error / error_description in either the query or fragment.
import * as Linking from "expo-linking";

import { supabase } from "./supabase";

export interface ParsedAuthLink {
  type: string | null; // "signup" | "recovery" | "magiclink" | …
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  error: string | null;
}

export function parseAuthLink(url: string): ParsedAuthLink {
  const params = new URLSearchParams();
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");

  if (queryIndex !== -1) {
    const end = hashIndex !== -1 && hashIndex > queryIndex ? hashIndex : url.length;
    new URLSearchParams(url.slice(queryIndex + 1, end)).forEach((v, k) => params.set(k, v));
  }
  // Fragment values win — that's where the implicit flow puts the tokens.
  if (hashIndex !== -1) {
    new URLSearchParams(url.slice(hashIndex + 1)).forEach((v, k) => params.set(k, v));
  }

  return {
    type: params.get("type"),
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    code: params.get("code"),
    error: params.get("error") ?? params.get("error_code"),
  };
}

/** True when the URL actually carries something to complete (tokens, a code, or an error). */
export function isAuthLink(parsed: ParsedAuthLink): boolean {
  return !!(parsed.error || parsed.code || (parsed.accessToken && parsed.refreshToken));
}

export class AuthLinkError extends Error {}

/**
 * Turn an auth deep link into a live session.
 * @returns the session's user id and the link type, or throws AuthLinkError.
 */
export async function completeAuthLink(url: string) {
  const parsed = parseAuthLink(url);
  if (parsed.error) throw new AuthLinkError(parsed.error);

  if (parsed.accessToken && parsed.refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });
    if (error || !data.session) throw new AuthLinkError(error?.message ?? "No session");
    return { session: data.session, type: parsed.type };
  }

  if (parsed.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error || !data.session) throw new AuthLinkError(error?.message ?? "No session");
    return { session: data.session, type: parsed.type };
  }

  throw new AuthLinkError("Nothing to complete");
}

/** Where Supabase should send email links so they open this app (add to Auth → URL Configuration → Redirect URLs). */
export function authRedirectUrl(): string {
  return Linking.createURL("/auth/callback");
}
