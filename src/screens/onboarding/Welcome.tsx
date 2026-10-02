// src/screens/onboarding/Welcome.tsx
import { router } from "expo-router";
import { View } from "react-native";

import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Wordmark } from "@/components/ui/Wordmark";

export function Welcome() {
  return (
    <OnboardingScreen centered maxWidth={320}>
      <View className="items-center">
        <View className="mb-10">
          <Wordmark />
        </View>

        <Text className="mb-3 text-center font-display text-2xl text-ink">Welcome to Akọ</Text>
        <Text className="mb-10 text-center text-ink-muted">Tell us what interests you. We'll help you find your people.</Text>

        <Button onPress={() => router.push("/onboarding/interests")}>Get started</Button>
      </View>
    </OnboardingScreen>
  );
}
