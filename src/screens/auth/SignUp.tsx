// src/screens/auth/SignUp.tsx
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import { AuthScreen } from "@/components/ui/AuthScreen";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { PasswordField } from "@/components/ui/PasswordField";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { Wordmark } from "@/components/ui/Wordmark";
import { setPendingAddAccount } from "@/lib/accountSessions";
import { authRedirectUrl } from "@/lib/authLink";
import { supabase } from "@/lib/supabase";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "error";

function friendlySignUpError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("already registered") || lower.includes("already exists") || lower.includes("already in use")) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (lower.includes("username") && (lower.includes("duplicate") || lower.includes("unique"))) {
    return "That username is already taken.";
  }
  return message;
}

export function SignUp() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const addMode = add === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const usernameCheckId = useRef(0);

  // Debounced live availability check. Each keystroke bumps checkId so a slow
  // earlier response can never overwrite the verdict for the latest text.
  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus("idle");
      return;
    }

    const checkId = ++usernameCheckId.current;
    setUsernameStatus("checking");

    const timeout = setTimeout(async () => {
      const { data, error: checkError } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
      if (checkId !== usernameCheckId.current) return;
      setUsernameStatus(checkError ? "error" : data ? "taken" : "available");
    }, 400);

    return () => clearTimeout(timeout);
  }, [username]);

  async function handleSubmit() {
    if (loading) return;
    setError(null);

    const cleanEmail = email.trim();
    if (!displayName.trim() || !username || !cleanEmail || !password) {
      setError("Fill in every field to continue.");
      return;
    }
    if (username.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (usernameStatus === "taken") {
      setError("That username is already taken.");
      return;
    }

    setLoading(true);

    // Re-check right before submitting — the debounced check may be stale.
    const { data: existing, error: recheckError } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();

    if (recheckError) {
      setLoading(false);
      setError("Couldn't verify that username right now. Please try again.");
      return;
    }
    if (existing) {
      setLoading(false);
      setUsernameStatus("taken");
      setError("That username is already taken.");
      return;
    }

    // add=1: remember the account we're leaving so AuthCallback can save it
    // to the switcher and link the two once the new email is confirmed.
    if (addMode) {
      const { data: currentSessionData } = await supabase.auth.getSession();
      const previousSession = currentSessionData.session;
      if (previousSession) {
        const { data: previousProfile } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .eq("id", previousSession.user.id)
          .single();
        if (previousProfile) {
          setPendingAddAccount({
            user_id: previousProfile.id,
            username: previousProfile.username,
            display_name: previousProfile.display_name,
            avatar_url: previousProfile.avatar_url,
            access_token: previousSession.access_token,
            refresh_token: previousSession.refresh_token,
          });
        }
      }
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { username, display_name: displayName.trim() },
        // The confirmation link opens THIS app (deep link) rather than the website.
        emailRedirectTo: authRedirectUrl(),
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(friendlySignUpError(signUpError.message));
      return;
    }

    // Supabase returns an empty identities array (instead of an error) when the
    // email is already registered, to avoid leaking which emails exist.
    if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
      setError("An account with this email already exists. Try logging in instead.");
      return;
    }

    router.push({ pathname: "/verify-email", params: { email: cleanEmail } });
  }

  return (
    <AuthScreen>
      <View className="mb-10">
        <Wordmark />
      </View>

      {addMode ? (
        <Text className="mb-6 text-center text-sm text-ink-muted">
          Create another personal account. Your current account stays saved on this device — switch back to it anytime.
        </Text>
      ) : null}

      <FormField
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="What people will see"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => usernameRef.current?.focus()}
        submitBehavior="submit"
      />
      <View className="mb-4">
        <FormField
          ref={usernameRef}
          label="Username"
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          submitBehavior="submit"
        />
        {usernameStatus === "checking" ? <Text className="-mt-4 text-xs text-ink-muted">Checking availability…</Text> : null}
        {usernameStatus === "taken" ? <Text className="-mt-4 text-xs text-danger">That username is already taken.</Text> : null}
        {usernameStatus === "available" ? <Text className="-mt-4 text-xs text-accent">Username is available.</Text> : null}
      </View>
      <FormField
        ref={emailRef}
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
      />
      <PasswordField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
      />

      {error ? (
        <Text accessibilityRole="alert" className="mb-4 text-sm text-danger">
          {error}
        </Text>
      ) : null}

      <Button onPress={handleSubmit} loading={loading}>
        Create account
      </Button>

      <Text className="mt-6 text-center text-sm text-ink-muted">
        Already have an account? <TextLink href={addMode ? "/login?add=1" : "/login"}>Log in</TextLink>
      </Text>
    </AuthScreen>
  );
}
