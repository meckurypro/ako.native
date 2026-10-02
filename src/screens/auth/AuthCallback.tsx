// src/screens/auth/AuthCallback.tsx
// Landing point for email links (confirm sign-up, recover password) opened as
// ako://auth/callback. Completes the session from the link, then:
//   recovery → /reset-password (to choose a new password)
//   otherwise → /onboarding/welcome (the account just got confirmed)
// If nothing usable arrives within 8s, or the link is bad/used, shows "Link expired".
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { AuthScreen } from "@/components/ui/AuthScreen";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Wordmark } from "@/components/ui/Wordmark";
import { saveAccount, takePendingAddAccount } from "@/lib/accountSessions";
import { completeAuthLink, isAuthLink, parseAuthLink } from "@/lib/authLink";
import { supabase } from "@/lib/supabase";

const WAIT_MS = 8000;

export function AuthCallback() {
  const queryClient = useQueryClient();
  const url = Linking.useLinkingURL();
  const [status, setStatus] = useState<"waiting" | "error">("waiting");
  const settled = useRef(false);

  // Give a link that hasn't arrived yet a moment, then give up.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!settled.current) setStatus("error");
    }, WAIT_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!url || settled.current) return;
    const parsed = parseAuthLink(url);
    if (!isAuthLink(parsed)) return;

    settled.current = true;

    (async () => {
      try {
        const { session, type } = await completeAuthLink(url);

        if (type === "recovery") {
          router.replace({ pathname: "/reset-password", params: { fromRecovery: "1" } });
          return;
        }

        // Finishing an "add another account" sign-up started from the switcher:
        // save the account we left, save this new one, and link the two.
        const pending = takePendingAddAccount();
        if (pending && pending.user_id !== session.user.id) {
          saveAccount(pending);
          const { data: newProfile } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("id", session.user.id)
            .single();
          if (newProfile) {
            saveAccount({
              user_id: newProfile.id,
              username: newProfile.username,
              display_name: newProfile.display_name,
              avatar_url: newProfile.avatar_url,
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            });
          }
          await supabase.rpc("link_accounts", { p_other_user_id: pending.user_id });
        }

        queryClient.clear();
        router.replace("/onboarding/welcome");
      } catch {
        setStatus("error");
      }
    })();
  }, [url, queryClient]);

  return (
    <AuthScreen>
      <View className="mb-8">
        <Wordmark />
      </View>

      {status === "waiting" ? (
        <Text className="text-center text-sm text-ink-muted">Confirming your link…</Text>
      ) : (
        <>
          <Text className="mb-2 text-center font-display text-2xl text-ink">Link expired</Text>
          <Text className="mb-8 text-center text-sm text-ink-muted">
            This link is invalid or has already been used. Request a new one below.
          </Text>
          <Button onPress={() => router.replace("/login")}>Back to log in</Button>
        </>
      )}
    </AuthScreen>
  );
}
