// src/lib/googleAuth.ts
//
// Google sign-in / sign-up on native — one flow: Supabase creates the account
// on first use and signs the person in every time after.
//
// How it works: signInWithOAuth() hands back the Google URL (we don't let it
// auto-open); we open it in the system's auth browser (ASWebAuthenticationSession
// on iOS, Custom Tabs on Android) and wait for it to bounce to ako://auth/oauth,
// then turn that link into a session with completeAuthLink() — the same helper
// the email links use.
//
// The redirect is a dedicated path (/auth/oauth, not /auth/callback). On Android
// the same deep link can ALSO be delivered to the router; /auth/callback would
// then race this flow and send everyone to onboarding. /auth/oauth just shows a
// "signing you in" screen (screens/auth/OAuthReturn.tsx) that this flow replaces.
//
// Setup: add `ako://auth/oauth` to Supabase → Authentication → URL
// Configuration → Redirect URLs (see docs/GOOGLE_AUTH_SETUP.md).
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { completeAuthLink } from "./authLink";
import { rememberReturnTo, takeReturnTo } from "./authRedirect";
import { supabase } from "./supabase";

// Finishes a pending auth session if the app was reopened mid-flow. No-op on native.
WebBrowser.maybeCompleteAuthSession();

export function googleRedirectUrl(): string {
  return Linking.createURL("/auth/oauth");
}

export type GoogleSignInResult =
  | { status: "success"; destination: string }
  | { status: "cancelled" };

/**
 * Runs the whole Google flow. Resolves "cancelled" if the person closes the
 * browser; throws on a real failure (the caller shows a message).
 */
export async function signInWithGoogle(returnTo?: string | null): Promise<GoogleSignInResult> {
  // Parked for BuildingAko, same as the email sign-up flow (lib/authRedirect.ts).
  rememberReturnTo(returnTo);

  const redirectTo = googleRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Always show the account chooser — otherwise Google silently reuses
      // whichever account the browser is already signed into.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) throw new Error(error?.message ?? "No Google URL");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return { status: "cancelled" };

  const { session } = await completeAuthLink(result.url);

  // Not finished onboarding → Welcome (the return path stays parked for
  // BuildingAko). Finished → straight to where they were headed. Mirrors the
  // web AuthCallback. If the lookup fails, Welcome is the safe fallback —
  // AuthGate resumes at whichever step is actually right.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", session.user.id)
    .single();

  const destination = profileRow?.onboarding_completed ? (takeReturnTo() ?? "/feed") : "/onboarding/welcome";
  return { status: "success", destination };
}
