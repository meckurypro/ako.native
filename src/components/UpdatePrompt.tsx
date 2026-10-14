// File: src/components/UpdatePrompt.tsx
// Surfaces over-the-air (EAS Update) JS updates in the UI.
//
// Why this exists: with `checkAutomatically: ON_LOAD` + `fallbackToCacheTimeout: 0` the app
// opens instantly, downloads a new update in the background and only applies it on the NEXT
// cold start — so nothing ever visibly changes. This component:
//   • re-checks for updates whenever the app returns to the foreground (throttled), so an app
//     that is kept in the background still picks up new updates, and
//   • shows a banner once an update is downloaded, with a one-tap restart.
// It does nothing in development (Expo Go / dev client) where expo-updates is disabled.
import * as Updates from "expo-updates";
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import Animated, { FadeInUp, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function UpdatePrompt() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  const lastCheckAt = useRef(0);
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!Updates.isEnabled) return;

    const check = async () => {
      const now = Date.now();
      if (now - lastCheckAt.current < CHECK_INTERVAL_MS) return;
      lastCheckAt.current = now;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline or the server is unreachable — try again on the next foreground.
      }
    };

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => sub.remove();
  }, []);

  if (!Updates.isEnabled || !isUpdatePending || dismissed) return null;

  const restart = async () => {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setRestarting(false);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 items-center px-4"
      style={{ paddingTop: insets.top + 8, zIndex: 65 }}
    >
      <Animated.View
        entering={FadeInUp.duration(200)}
        exiting={FadeOut.duration(120)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className="w-full max-w-sm flex-row items-center gap-3 rounded-2xl bg-ink px-4 py-3"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <Text className="flex-1 text-sm leading-snug text-canvas">
          A new version of Akọ is ready.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss update"
          onPress={() => setDismissed(true)}
          hitSlop={8}
          disabled={restarting}
        >
          <Text className="text-sm text-ink-muted">Later</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restart to update"
          onPress={restart}
          hitSlop={8}
          disabled={restarting}
          className="rounded-full bg-canvas px-3 py-1.5"
        >
          <Text className="text-sm font-semibold text-ink">
            {restarting ? "Restarting…" : "Restart"}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
