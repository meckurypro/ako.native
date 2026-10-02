// src/app/(onboarding)/_layout.tsx
// Signed-in users who haven't finished onboarding. Signed-out visitors still
// bounce to /login; users who already finished are sent to /feed.
import { Stack } from "expo-router";

import { AuthGate } from "@/components/nav/AuthGate";
import { useTheme } from "@/theme/ThemeProvider";

export default function OnboardingLayout() {
  const { colors } = useTheme();
  return (
    <AuthGate skipOnboardingCheck onboardingOnly>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
    </AuthGate>
  );
}
