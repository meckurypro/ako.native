// src/components/nav/AuthGate.tsx
// Native port of web RequireAuth (+ OnboardingStepGuard). Used as a *layout*
// guard instead of wrapping every route: (app)/_layout gates the whole signed-in
// app once, (onboarding)/_layout gates onboarding.
//
//   signed out                       → /login
//   access check failed              → retry screen (fails CLOSED, like web)
//   account under review             → AccountUnderReview
//   onboarding incomplete            → resume at the right step
//   onboarding already complete      → (onboardingOnly) back to /feed
import { Redirect, type Href } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { useAccountAccess } from "@/hooks/useAccountAccess";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingStatus } from "@/hooks/useOnboarding";
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
  const { data: onboarding, isLoading: onboardingLoading } = useOnboardingStatus();
  const { data: access, isLoading: accessLoading, isError: accessError, refetch } = useAccountAccess();

  const stillResolving =
    loading || (!!user && !skipOnboardingCheck && onboardingLoading) || (!!user && accessLoading) || (!!user && onboardingOnly && onboardingLoading);

  if (stillResolving) return <FullScreenLoading />;

  if (!user) return <Redirect href={"/login" as Href} />;

  if (accessError) {
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

  return <>{children}</>;
}
