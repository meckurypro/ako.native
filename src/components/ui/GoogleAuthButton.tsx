// src/components/ui/GoogleAuthButton.tsx
// The primary action on Login and SignUp (Google first, email is the quieter
// alternative below it). Mirrors the web GoogleAuthButton.
import { useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import NetInfo from "@react-native-community/netinfo";

import { GoogleGlyph } from "@/components/ui/BrandIcons";
import { Text } from "@/components/ui/Text";
import { NETWORK_AUTH_MESSAGE, authErrorMessage } from "@/lib/authErrors";
import { signInWithGoogle } from "@/lib/googleAuth";

interface GoogleAuthButtonProps {
  /** Where the visitor was headed (already run through safeReturnPath). */
  returnTo?: string | null;
  /** Sign-up pages read "Sign up with Google". */
  label?: string;
}

/** The quiet "or" rule between the primary Google action and the email alternative. */
export function AuthOrDivider() {
  return (
    <View className="my-5 flex-row items-center gap-3" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View className="h-px flex-1 bg-border" />
      <Text className="text-xs uppercase tracking-wider text-ink-muted">or</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

export function GoogleAuthButton({ returnTo, label = "Continue with Google" }: GoogleAuthButtonProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePress() {
    if (loading) return;
    setError(null);
    setLoading(true);
    // With no network connection at all the browser sheet would just open onto an error page. (Only a definite "not
    // connected" stops it — "connected but can't reach the internet" is a guess the request itself settles.)
    if ((await NetInfo.fetch().catch(() => null))?.isConnected === false) {
      setError(NETWORK_AUTH_MESSAGE);
      setLoading(false);
      return;
    }
    try {
      const result = await signInWithGoogle(returnTo);
      if (result.status === "success") {
        queryClient.clear();
        router.replace(result.destination as Href);
        return;
      }
      // "cancelled": they closed the browser — nothing to say.
    } catch (err) {
      setError(authErrorMessage(err, "Couldn't sign in with Google. Please try again."));
    }
    setLoading(false);
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: loading, busy: loading }}
        disabled={loading}
        onPress={handlePress}
        className={`h-12 w-full flex-row items-center justify-center gap-3 rounded-xl bg-ink px-6 active:opacity-80 ${loading ? "opacity-50" : ""}`}
      >
        <View className="h-7 w-7 items-center justify-center rounded-full bg-white">
          <GoogleGlyph size={16} />
        </View>
        <Text className="font-body text-base font-semibold text-canvas">{loading ? "Opening Google…" : label}</Text>
      </Pressable>

      {error ? (
        <Text accessibilityRole="alert" className="mt-3 text-center text-sm text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
