// src/screens/onboarding/CompleteProfile.tsx
// First step for Google sign-ups, before Welcome. Google gives us a name but no
// username, and the one the database invents from the email is only a
// placeholder — so the person picks their own handle and confirms their name
// here. Email sign-ups choose both on the sign-up form and never see this.
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Text } from "@/components/ui/Text";
import { Wordmark } from "@/components/ui/Wordmark";
import { useAuth } from "@/hooks/useAuth";
import { useCompleteProfileSetup } from "@/hooks/useOnboarding";
import { supabase } from "@/lib/supabase";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "error";

export function CompleteProfile() {
  const { user } = useAuth();
  const completeProfile = useCompleteProfileSetup();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  const usernameRef = useRef<TextInput>(null);
  const usernameCheckId = useRef(0);
  const prefilled = useRef(false);

  // Prefill the name Google gave us. The username starts empty on purpose:
  // the auto-generated one is derived from the email address.
  useEffect(() => {
    if (prefilled.current || !user) return;
    prefilled.current = true;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    setDisplayName(String(meta.full_name ?? meta.name ?? meta.display_name ?? "").trim());
  }, [user]);

  // Debounced availability check — a UX nicety; complete_profile_setup is the
  // real enforcement. Excludes the person's own row.
  useEffect(() => {
    if (username.length < 3 || !user) {
      setUsernameStatus("idle");
      return;
    }
    const checkId = ++usernameCheckId.current;
    setUsernameStatus("checking");

    const timeout = setTimeout(async () => {
      const { data, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user.id)
        .maybeSingle();
      if (checkId !== usernameCheckId.current) return;
      setUsernameStatus(checkError ? "error" : data ? "taken" : "available");
    }, 400);

    return () => clearTimeout(timeout);
  }, [username, user]);

  async function handleSubmit() {
    if (completeProfile.isPending) return;
    setError(null);

    const name = displayName.trim();
    if (!name) {
      setError("Enter the name you'd like people to see.");
      return;
    }
    if (username.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }
    if (usernameStatus === "taken") {
      setError("That username is already taken.");
      return;
    }

    try {
      await completeProfile.mutateAsync({ username, displayName: name });
      router.replace("/onboarding/welcome");
    } catch (err) {
      const message = (err as { message?: string })?.message ?? "";
      if (message.includes("username_taken")) {
        setUsernameStatus("taken");
        setError("That username is already taken.");
      } else if (message.includes("invalid_username")) {
        setError("Usernames use lowercase letters, numbers and underscores (3–30 characters).");
      } else {
        setError("Couldn't save your profile. Please try again.");
      }
    }
  }

  return (
    <OnboardingScreen centered maxWidth={384}>
      <View className="mb-10">
        <Wordmark />
      </View>

      <Text className="mb-2 text-center font-display text-2xl text-ink">Complete your profile</Text>
      <Text className="mb-8 text-center text-sm text-ink-muted">Choose how you'll appear on Akọ.</Text>

      <FormField
        label="Display name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="What people will see"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={60}
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
          maxLength={30}
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
        />
        {usernameStatus === "checking" ? <Text className="-mt-4 text-xs text-ink-muted">Checking availability…</Text> : null}
        {usernameStatus === "taken" ? <Text className="-mt-4 text-xs text-danger">That username is already taken.</Text> : null}
        {usernameStatus === "available" ? <Text className="-mt-4 text-xs text-accent">Username is available.</Text> : null}
      </View>

      {error ? (
        <Text accessibilityRole="alert" className="mb-4 text-sm text-danger">
          {error}
        </Text>
      ) : null}

      <Button onPress={handleSubmit} loading={completeProfile.isPending}>
        Continue
      </Button>
    </OnboardingScreen>
  );
}
