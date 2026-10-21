// src/components/nav/AuthGate.tsx
// Native port of web RequireAuth (+ OnboardingStepGuard). Used as a *layout*
// guard instead of wrapping every route: (app)/_layout gates the whole signed-in
// app once, (onboarding)/_layout gates onboarding.
//
//   signed out                       → /login
//   access check failed              → retry screen (fails CLOSED, like web) — unless the failure is "couldn't reach the
//                                      server": then the app opens (see below) so downloads and cached screens work
//   pending account (gate on)        → enters in restricted consumer-only mode (silent; see useIsRestricted)
//   declined / suspended             → AccountUnderReview
//   onboarding incomplete            → resume at the right step (Google sign-ups: /onboarding/profile first)
//   onboarding already complete      → (onboardingOnly) back to /feed
import { Redirect, usePathname, type Href } from "expo-router";
import { useRef, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { useAccountAccess } from "@/hooks/useAccountAccess";
import { useAuth } from "@/hooks/useAuth";
import { useBootGrace } from "@/hooks/useBootGrace";
import { useOnboardingStatus } from "@/hooks/useOnboarding";
import { safeReturnPath } from "@/lib/authRedirect";
import { isNetworkError } from "@/lib/offlineBoot";
import { AccountUnderReview } from "@/screens/AccountUnderReview";
import { useTheme } from "@/theme/ThemeProvider";

interface AuthGateProps {
  children: ReactNode;
  /** Onboarding screens: don't bounce incomplete users back into onboarding. */
  skipOnboardingCheck?: boolean;
  /** Onboarding screens: send users who already finished to the feed. */
  onboardingOnly?: boolean;
}

export function FullScreenLoading() {
  const { colors } = useTheme();
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/**
 * How long the app waits for the account / onboarding checks at launch. Past this it opens anyway and keeps checking in
 * the background: a decline, suspension or unfinished onboarding that arrives later still takes over the screen. Without
 * a ceiling, a connected-but-dead network (the request hangs for a minute or more) froze the app on its loading screen.
 * Safe because the server, not this gate, is what enforces access (RLS + edge-function checks).
 */
const CHECKS_GRACE_MS = 4000;

export function AuthGate({ children, skipOnboardingCheck = false, onboardingOnly = false }: AuthGateProps) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { data: onboarding, isLoading: onboardingLoading } = useOnboardingStatus();
  const { data: access, isLoading: accessLoading, isError: accessIsError, error: accessErrorValue, refetch } = useAccountAccess();
  const graceOver = useBootGrace(CHECKS_GRACE_MS);
  // A failed check only blocks when the server actually answered badly. "Couldn't reach it" (offline, dead data) opens
  // the app instead — otherwise people with no signal can't reach what they downloaded. React Query re-runs the check
  // when the connection returns, and a real answer then applies (decline → Under Review, etc.).
  const accessError = accessIsError && !isNetworkError(accessErrorValue);

  // Once the app has been shown for this user, keep it mounted through later re-checks. Swapping the children for a
  // spinner / retry screen unmounts the navigator, which wipes its stack; on remount it starts from its first declared
  // screen instead of where the person was. That is what reopened the Create sheet on top of the profile after an account
  // switch or after the network dropped and came back. A different user (account switch) still gets the full-screen load.
  const shownFor = useRef<string | null>(null);
  const keepMounted = !!user && shownFor.current === user.id;

  const checksPending =
    (!!user && !skipOnboardingCheck && onboardingLoading) || (!!user && accessLoading) || (!!user && onboardingOnly && onboardingLoading);
  const stillResolving = loading || (checksPending && !graceOver);

  if (stillResolving && !keepMounted) return <FullScreenLoading />;

  if (!user) {
    // A cold-start deep link (a shared /:slug) hasn't shown the app yet, so
    // remember where it was headed and send them back after login. A sign-out
    // from inside the app doesn't: the next login shouldn't resume the old screen.
    const cameFromDeepLink = shownFor.current === null;
    shownFor.current = null;
    const returnTo = cameFromDeepLink ? safeReturnPath(pathname) : null;
    return <Redirect href={(returnTo ? { pathname: "/login", params: { redirect: returnTo } } : "/login") as Href} />;
  }

  if (accessError && !keepMounted) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas px-6">
        <Text className="max-w-xs text-center text-sm text-ink-muted">
          We couldn't confirm your account access. Check your connection and try again.
        </Text>
        <Pressable onPress={() => refetch()} accessibilityRole="button">
          <Text className="text-sm font-medium text-accent">Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (access && !access.canAccess) return <AccountUnderReview />;

  if (onboardingOnly && onboarding?.completed) return <Redirect href={"/feed" as Href} />;

  // Google sign-ups pick their username + name before any other onboarding step.
  const onProfileStep = pathname === "/onboarding/profile";
  if (onboardingOnly && onboarding && !onboarding.completed) {
    if (!onboarding.profileSetupCompleted && !onProfileStep) return <Redirect href={"/onboarding/profile" as Href} />;
    if (onboarding.profileSetupCompleted && onProfileStep) return <Redirect href={"/onboarding/welcome" as Href} />;
  }

  if (!skipOnboardingCheck && onboarding && !onboarding.completed) {
    const resumeAt = !onboarding.profileSetupCompleted
      ? "/onboarding/profile"
      : onboarding.hasInterests
        ? "/onboarding/people"
        : "/onboarding/welcome";
    return <Redirect href={resumeAt as Href} />;
  }

  shownFor.current = user.id;
  return <>{children}</>;
}
