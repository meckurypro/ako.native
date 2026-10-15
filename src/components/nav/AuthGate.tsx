// src/components/nav/AuthGate.tsx
// Native port of web RequireAuth (+ OnboardingStepGuard). Used as a *layout*
// guard instead of wrapping every route: (app)/_layout gates the whole signed-in
// app once, (onboarding)/_layout gates onboarding.
//
//   signed out                       → /login
//   access check failed              → retry screen (fails CLOSED, like web)
//   pending account (gate on)        → enters in restricted consumer-only mode (silent; see useIsRestricted)
//   declined / suspended             → AccountUnderReview
//   onboarding incomplete            → resume at the right step
//   onboarding already complete      → (onboardingOnly) back to /feed
import { Redirect, usePathname, type Href } from "expo-router";
import { useRef, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { useAccountAccess } from "@/hooks/useAccountAccess";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingStatus } from "@/hooks/useOnboarding";
import { safeReturnPath } from "@/lib/authRedirect";
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

export function AuthGate({ children, skipOnboardingCheck = false, onboardingOnly = false }: AuthGateProps) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { data: onboarding, isLoading: onboardingLoading } = useOnboardingStatus();
  const { data: access, isLoading: accessLoading, isError: accessError, refetch } = useAccountAccess();

  // Once the app has been shown for this user, keep it mounted through later re-checks. Swapping the children for a
  // spinner / retry screen unmounts the navigator, which wipes its stack; on remount it starts from its first declared
  // screen instead of where the person was. That is what reopened the Create sheet on top of the profile after an account
  // switch or after the network dropped and came back. A different user (account switch) still gets the full-screen load.
  const shownFor = useRef<string | null>(null);
  const keepMounted = !!user && shownFor.current === user.id;

  const stillResolving =
    loading || (!!user && !skipOnboardingCheck && onboardingLoading) || (!!user && accessLoading) || (!!user && onboardingOnly && onboardingLoading);

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

  if (!skipOnboardingCheck && onboarding && !onboarding.completed) {
    return <Redirect href={(onboarding.hasInterests ? "/onboarding/people" : "/onboarding/welcome") as Href} />;
  }

  shownFor.current = user.id;
  return <>{children}</>;
}
