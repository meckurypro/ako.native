// src/screens/auth/Login.tsx
import { Redirect, router, useLocalSearchParams, type Href } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import { AuthScreen } from "@/components/ui/AuthScreen";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { PasswordField } from "@/components/ui/PasswordField";
import { TextLink } from "@/components/ui/TextLink";
import { Text } from "@/components/ui/Text";
import { Wordmark } from "@/components/ui/Wordmark";
import { useAddAccount } from "@/hooks/useAccountSwitcher";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

export function Login() {
  const { user, loading: authLoading } = useAuth();
  const { redirect, add } = useLocalSearchParams<{ redirect?: string; add?: string }>();

  // Only same-app paths are honoured as a post-login destination (no open redirects).
  const redirectTo = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/feed";
  // add=1: signing into a SECOND personal account from the account switcher.
  const addMode = add === "1";
  const addAccount = useAddAccount();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  if (!addMode && !authLoading && user) return <Redirect href={redirectTo as Href} />;

  async function handleSubmit() {
    if (loading) return;
    setError(null);
    setUnconfirmed(false);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);

    if (addMode) {
      try {
        const newProfile = await addAccount.mutateAsync({ email: cleanEmail, password });
        setLoading(false);
        router.replace(`/profile/${newProfile.username}` as Href);
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error && err.message ? err.message : "Incorrect email or password.");
      }
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setLoading(false);

    if (signInError) {
      if (signInError.message.toLowerCase().includes("email not confirmed")) {
        setUnconfirmed(true);
        setError("Confirm your email first. Check your inbox for the link we sent you.");
      } else {
        setError("Incorrect email or password.");
      }
      return;
    }

    router.replace(redirectTo as Href);
  }

  async function handleResend() {
    setResending(true);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    setResending(false);

    if (!resendError) {
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    }
  }

  return (
    <AuthScreen>
      <View className="mb-10">
        <Wordmark />
      </View>

      {addMode ? (
        <Text className="mb-6 text-center text-sm text-ink-muted">
          Sign into another personal account. Your current account stays saved on this device — switch back to it
          anytime.
        </Text>
      ) : null}

      <FormField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        submitBehavior="submit"
        autoFocus
      />
      <PasswordField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />

      {error ? (
        <Text accessibilityRole="alert" className="mb-4 text-sm text-danger">
          {error}
        </Text>
      ) : null}

      {unconfirmed ? (
        <View className="mb-4 self-start">
          <TextLink onPress={handleResend} disabled={resending}>
            {resending ? "Sending…" : resent ? "Link sent" : "Resend confirmation link"}
          </TextLink>
        </View>
      ) : null}

      <Button onPress={handleSubmit} loading={loading}>
        {addMode ? "Add account" : "Log in"}
      </Button>

      {!addMode ? (
        <Text className="mt-4 text-center text-sm">
          <TextLink href="/reset-password" className="text-accent">
            Forgot password?
          </TextLink>
        </Text>
      ) : null}

      <Text className="mt-6 text-center text-sm text-ink-muted">
        New to Akọ? <TextLink href={addMode ? "/signup?add=1" : "/signup"}>Create an account</TextLink>
      </Text>
    </AuthScreen>
  );
}
