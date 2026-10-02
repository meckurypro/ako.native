// src/screens/onboarding/BuildingAko.tsx
// Final step: marks onboarding complete, holds for at least ~1.1s so the screen
// doesn't flash, then drops into the feed. Retry on failure.
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Wordmark } from "@/components/ui/Wordmark";
import { useCompleteOnboarding } from "@/hooks/useOnboarding";
import { useTheme } from "@/theme/ThemeProvider";

const MIN_DISPLAY_MS = 1100;

export function BuildingAko() {
  const { colors } = useTheme();
  const completeOnboarding = useCompleteOnboarding();
  const [failed, setFailed] = useState(false);
  const cancelledRef = useRef(false);

  const run = useCallback(async () => {
    setFailed(false);
    const startedAt = Date.now();
    try {
      await completeOnboarding.mutateAsync();

      const elapsed = Date.now() - startedAt;
      await new Promise<void>((resolve) => setTimeout(() => resolve(), Math.max(0, MIN_DISPLAY_MS - elapsed)));

      if (!cancelledRef.current) router.replace("/feed");
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
      if (!cancelledRef.current) setFailed(true);
    }
  }, [completeOnboarding]);

  useEffect(() => {
    cancelledRef.current = false;
    run();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OnboardingScreen centered maxWidth={320}>
      <View className="items-center">
        <View className="mb-8">
          <Wordmark />
        </View>

        {!failed ? (
          <>
            <ActivityIndicator size="large" color={colors.accent} className="mb-6" />
            <Text className="mb-2 text-center font-display text-xl text-ink">Building your Akọ…</Text>
            <Text className="text-center text-sm text-ink-muted">Getting your feed ready.</Text>
          </>
        ) : (
          <>
            <Text className="mb-2 text-center font-display text-xl text-ink">Something went wrong</Text>
            <Text className="mb-6 text-center text-sm text-ink-muted">
              We couldn't finish setting up your Akọ. Check your connection and try again.
            </Text>
            <View className="w-40">
              <Button onPress={run} loading={completeOnboarding.isPending}>
                Try again
              </Button>
            </View>
          </>
        )}
      </View>
    </OnboardingScreen>
  );
}
