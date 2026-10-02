// src/screens/auth/ResetPassword.tsx
// Three states in one screen: ask for an email → "check your inbox" → (after
// the recovery link opens the app) choose a new password.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { AuthScreen } from "@/components/ui/AuthScreen";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { PasswordField } from "@/components/ui/PasswordField";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { Wordmark } from "@/components/ui/Wordmark";
import { authRedirectUrl } from "@/lib/authLink";
import { supabase } from "@/lib/supabase";

type Step = "email" | "sent" | "new_password" | "done";

export function ResetPassword() {
  const { fromRecovery } = useLocalSearchParams<{ fromRecovery?: string }>();

  const [step, setStep] = useState<Step>(fromRecovery === "1" ? "new_password" : "email");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (doneTimer.current) clearTimeout(doneTimer.current);
  }, []);

  async function handleRequestLink() {
    if (loading) return;
    setError(null);
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl(),
    });

    setLoading(false);

    // Deliberately identical outcome whether or not the account exists, so this
    // screen can't be used to discover which emails are registered.
    if (resetError) console.error("resetPasswordForEmail error:", resetError.message);

    setStep("sent");
  }

  async function handleSetNewPassword() {
    if (loading) return;
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setStep("done");
    doneTimer.current = setTimeout(() => router.replace("/feed"), 1500);
  }

  return (
    <AuthScreen>
      <View className="mb-10">
        <Wordmark />
      </View>

      {step === "email" ? (
        <>
          <Text className="mb-2 text-center font-display text-2xl text-ink">Reset password</Text>
          <Text className="mb-6 text-center text-sm text-ink-muted">Enter your email and we'll send you a link.</Text>
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={handleRequestLink}
            autoFocus
          />
          {error ? (
            <Text accessibilityRole="alert" className="mb-4 text-sm text-danger">
              {error}
            </Text>
          ) : null}
          <Button onPress={handleRequestLink} loading={loading}>
            Send link
          </Button>
        </>
      ) : null}

      {step === "sent" ? (
        <View>
          <Text className="mb-2 text-center font-display text-2xl text-ink">Check your email</Text>
          <Text className="text-center text-sm text-ink-muted">
            If an account exists for <Text className="font-medium text-ink">{email}</Text>, we've sent a link to reset your
            password.
          </Text>
        </View>
      ) : null}

      {step === "new_password" ? (
        <>
          <Text className="mb-2 text-center font-display text-2xl text-ink">New password</Text>
          <Text className="mb-6 text-center text-sm text-ink-muted">Choose a new password for your account.</Text>
          <PasswordField
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleSetNewPassword}
            autoFocus
          />
          {error ? (
            <Text accessibilityRole="alert" className="mb-4 text-sm text-danger">
              {error}
            </Text>
          ) : null}
          <Button onPress={handleSetNewPassword} loading={loading}>
            Update password
          </Button>
        </>
      ) : null}

      {step === "done" ? (
        <Text className="text-center font-medium text-accent">Password updated. Taking you to your feed…</Text>
      ) : null}

      {step === "email" ? (
        <Text className="mt-6 text-center text-sm text-ink-muted">
          Remembered it? <TextLink href="/login" replace>Log in</TextLink>
        </Text>
      ) : null}
    </AuthScreen>
  );
}
