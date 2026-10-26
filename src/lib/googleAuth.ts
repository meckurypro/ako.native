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
// Android: the Custom Tab must live in the app's OWN task (createTask: false below). By default expo-web-browser
// opens it in a separate task, and the ako:// redirect then brings the app up *inside the browser's task* — the
// tab never closes and the whole app keeps rendering in it. In the app's task, the redirect lands on the
// singleTask activity, which pops the tab off the stack and returns to the app cleanly. iOS ignores the option
// (ASWebAuthenticationSession closes itself).
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

import { saveAccount } from "./accountSessions";
import { completeAuthLink } from "./authLink";
import { rememberReturnTo, takeReturnTo } from "./authRedirect";
import { supabase } from "./supabase";

// Finishes a pending auth session if the app was reopened mid-flow. No-op on native.
WebBrowser.maybeCompleteAuthSession();

export function googleRedirectUrl(): string {
  return Linking.createURL("/auth/oauth");
}

export type GoogleSignInResult =
  // alreadyCurrent: add-account mode, and Google's chooser handed back the account that was already signed in.
  | { status: "success"; destination: string; alreadyCurrent?: boolean }
  | { status: "cancelled" };

type ProfileSnapshot = { id: string; username: string; display_name: string; avatar_url: string | null };

async function loadProfileSnapshot(userId: string): Promise<ProfileSnapshot | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("id", userId)
    .single();
  return data ?? null;
}

/**
 * Runs the whole Google flow. Resolves "cancelled" if the person closes the
 * browser; throws on a real failure (the caller shows a message).
 */
export async function signInWithGoogle(
  returnTo?: string | null,
  options?: { addAccount?: boolean }
): Promise<GoogleSignInResult> {
  // Parked for BuildingAko, same as the email sign-up flow (lib/authRedirect.ts).
  rememberReturnTo(returnTo);

  // "Add account": the new session is about to replace the live one, so the account that is active now is
  // snapshotted first — tokens included — exactly like the email add-account path (useAddAccount).
  const previousSession = options?.addAccount ? (await supabase.auth.getSession()).data.session : null;
  const previousProfile = previousSession ? await loadProfileSnapshot(previousSession.user.id) : null;

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

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { createTask: false });
  if (result.type !== "success") return { status: "cancelled" };

  const { session } = await completeAuthLink(result.url);

  if (options?.addAccount && previousSession) {
    if (session.user.id === previousSession.user.id) {
      return { status: "success", destination: "/feed", alreadyCurrent: true };
    }
    if (previousProfile) {
      saveAccount({
        user_id: previousProfile.id,
        username: previousProfile.username,
        display_name: previousProfile.display_name,
        avatar_url: previousProfile.avatar_url,
        access_token: previousSession.access_token,
        refresh_token: previousSession.refresh_token,
      });
    }
    const newProfile = await loadProfileSnapshot(session.user.id);
    if (newProfile) {
      saveAccount({
        user_id: newProfile.id,
        username: newProfile.username,
        display_name: newProfile.display_name,
        avatar_url: newProfile.avatar_url,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    }
    // Best-effort, same as the email path: the switcher works on this device even if the link isn't recorded.
    await supabase.rpc("link_accounts", { p_other_user_id: previousSession.user.id });
  }

  // Not finished onboarding → Welcome (the return path stays parked for
  // BuildingAko). Finished → straight to where they were headed. Mirrors the
  // web AuthCallback. If the lookup fails, Welcome is the safe fallback —
  // AuthGate resumes at whichever step is actually right.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("onboarding_completed, profile_setup_completed, username")
    .eq("id", session.user.id)
    .single();

  // New Google account → pick a username + name first, then the usual onboarding.
  // An account added from the switcher lands on its own profile, like the email add-account path.
  const addedUsername = options?.addAccount && previousSession ? profileRow?.username : null;
  const destination = profileRow?.onboarding_completed
    ? addedUsername
      ? `/profile/${addedUsername}`
      : (takeReturnTo() ?? "/feed")
    : profileRow?.profile_setup_completed === false
      ? "/onboarding/profile"
      : "/onboarding/welcome";
  return { status: "success", destination };
}
