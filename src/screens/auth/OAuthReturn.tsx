// src/screens/auth/OAuthReturn.tsx
// Landing point for ako://auth/oauth — where Google sign-in bounces back to.
// lib/googleAuth.ts finishes the sign-in itself (and navigates away from here),
// so this is only a "signing you in" holding screen for the moments the deep
// link is also handed to the router (Android). If nothing has taken over after
// a while — the sign-in was abandoned or failed — send them back to log in.
import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { AuthScreen } from "@/components/ui/AuthScreen";
import { Text } from "@/components/ui/Text";
import { Wordmark } from "@/components/ui/Wordmark";

const GIVE_UP_MS = 15000;

export function OAuthReturn() {
  useEffect(() => {
    const timeout = setTimeout(() => router.replace("/login"), GIVE_UP_MS);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <AuthScreen>
      <View className="mb-8">
        <Wordmark />
      </View>
      <Text className="text-center text-sm text-ink-muted">Signing you in…</Text>
    </AuthScreen>
  );
}
