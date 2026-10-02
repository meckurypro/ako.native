// src/screens/auth/VerifyEmail.tsx
import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { AuthScreen } from "@/components/ui/AuthScreen";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { Wordmark } from "@/components/ui/Wordmark";
import { authRedirectUrl } from "@/lib/authLink";
import { supabase } from "@/lib/supabase";

export function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email?: string }>();

  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  // Landing here without an email (cold start / stale link) means the sign-up never happened.
  if (!email) return <Redirect href={"/signup" as Href} />;

  async function handleResend() {
    setResending(true);
    setError(null);

    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email as string,
      options: { emailRedirectTo: authRedirectUrl() },
    });

    setResending(false);

    if (resendError) {
      setError("Couldn't resend the link. Try again in a moment.");
      return;
    }

    setResent(true);
    setTimeout(() => setResent(false), 4000);
  }

  return (
    <AuthScreen>
      <View className="mb-8">
        <Wordmark />
      </View>

      <Text className="mb-2 text-center font-display text-2xl text-ink">Check your email</Text>
      <Text className="mb-8 text-center text-sm text-ink-muted">
        We sent a confirmation link to <Text className="font-medium text-ink">{email}</Text>. Open it to activate your
        account.
      </Text>

      {error ? (
        <Text accessibilityRole="alert" className="mb-4 text-center text-sm text-danger">
          {error}
        </Text>
      ) : null}

      <View className="items-center">
        <TextLink onPress={handleResend} disabled={resending} className="text-sm font-medium text-accent">
          {resending ? "Sending…" : resent ? "Link sent" : "Resend link"}
        </TextLink>
      </View>

      <Text className="mt-6 text-center text-sm text-ink-muted">
        Already confirmed? <TextLink href="/login" replace>Back to log in</TextLink>
      </Text>
    </AuthScreen>
  );
}
