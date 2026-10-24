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
import { useToast } from "@/components/ui/Toast";
import { NETWORK_AUTH_MESSAGE, authErrorMessage } from "@/lib/authErrors";
import { signInWithGoogle } from "@/lib/googleAuth";
import { useTheme } from "@/theme/ThemeProvider";

interface GoogleAuthButtonProps {
  /** Where the visitor was headed (already run through safeReturnPath). */
  returnTo?: string | null;
  /** Sign-up pages read "Sign up with Google". */
  label?: string;
  /** Adding a second account from the switcher: keep the account that is signed in now alongside the new one. */
  addAccount?: boolean;
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

export function GoogleAuthButton({ returnTo, label = "Continue with Google", addAccount = false }: GoogleAuthButtonProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { resolvedTheme, setPageMode } = useTheme();
  const dark = resolvedTheme === "dark";
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
      const result = await signInWithGoogle(returnTo, { addAccount });
      if (result.status === "success") {
        // An added account starts in its own palette, never the previous account's page colours (as useAddAccount does).
        if (addAccount && !result.alreadyCurrent) setPageMode(false);
        queryClient.clear();
        router.replace(result.destination as Href);
        toast(result.alreadyCurrent ? "That's already your current account." : "Welcome to Akọ.", {
          variant: result.alreadyCurrent ? "default" : "success",
        });
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
        // Pill-shaped, Claude-style: on the dark theme a solid white pill with dark text (no border); on the light
        // theme a white pill with a hairline border so it still reads against the page.
        className={`h-[52px] w-full flex-row items-center justify-center gap-3 rounded-full px-6 active:opacity-80 ${loading ? "opacity-50" : ""}`}
        style={{ backgroundColor: "#FFFFFF", borderWidth: dark ? 0 : 1, borderColor: "#D9D6CF" }}
      >
        <GoogleGlyph size={20} />
        <Text style={{ color: "#141413" }} className="font-body text-base font-medium">
          {loading ? "Opening Google…" : label}
        </Text>
      </Pressable>

      {error ? (
        <Text accessibilityRole="alert" className="mt-3 text-center text-sm text-danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
