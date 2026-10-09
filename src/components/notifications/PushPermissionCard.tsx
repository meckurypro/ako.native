// src/components/notifications/PushPermissionCard.tsx
// Contextual ask for notification permission — shown where the value is obvious (the Notifications screen),
// never at launch. Three states: not yet asked → explain, then the OS prompt; denied but askable (Android) →
// ask again; blocked (iOS after one denial, or "Don't ask again") → only system Settings can change it.
import { Bell } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { usePushPermission } from "@/lib/pushPermissionStore";

const DISMISS_KEY = "ako-push-card-dismissed-at";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

function recentlyDismissed(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY));
  return !!at && Date.now() - at < DISMISS_FOR_MS;
}

export function PushPermissionCard() {
  const { status, canAskAgain, loaded, request } = usePushPermission();
  const [dismissed, setDismissed] = useState(recentlyDismissed);

  if (!loaded || status === "granted" || dismissed) return null;
  const blocked = status === "denied" && !canAskAgain;

  return (
    <View className="mb-3 rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft">
          <Icon as={Bell} size={17} className="text-accent" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-ink">Turn on notifications</Text>
          <Text className="mt-0.5 text-xs text-ink-muted">
            {blocked ? "Notifications are off for Akọ. Turn them on in Settings to hear about messages, follows and sales as they happen." : "Hear about messages, follows, comments and sales as they happen — even when the app is closed."}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row items-center gap-4 pl-12">
        <Pressable onPress={() => (blocked ? void Linking.openSettings() : void request())} accessibilityRole="button" className="rounded-full bg-accent px-4 py-1.5">
          <Text className="text-xs font-medium text-canvas">{blocked ? "Open Settings" : "Turn on"}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
            setDismissed(true);
          }}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text className="text-xs text-ink-muted">Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}
