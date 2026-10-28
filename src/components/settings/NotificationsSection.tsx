// src/components/settings/NotificationsSection.tsx
// Push notification status + the one action that applies: ask (not yet asked), ask again (Android, soft
// denial), or jump to system Settings (the only place a blocked permission can be changed).
import { Bell, BellOff, BellRing } from "lucide-react-native";
import { useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";

import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { scheduleLocalTestNotification } from "@/lib/push";
import { usePushPermission } from "@/lib/pushPermissionStore";
import { usePushStatus } from "@/lib/pushStatusStore";

export function NotificationsSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { status, canAskAgain, request } = usePushPermission();
  const toast = useToast();
  const pushStatus = usePushStatus();
  const [testing, setTesting] = useState(false);
  const on = status === "granted";
  const blocked = status === "denied" && !canAskAgain;

  async function handleEnable() {
    const result = await request();
    if (result.status !== "granted") toast("Notifications are still off.", { variant: "error" });
  }

  async function handleTest() {
    setTesting(true);
    try {
      await scheduleLocalTestNotification(5);
      toast("Test notification in 5 seconds — try locking the screen.");
    } catch {
      toast("Couldn't schedule the test notification.", { variant: "error" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <SettingsSection icon={<Icon as={Bell} size={18} className="text-ink-muted" />} title="Notifications" summary={on ? "On" : "Off"} open={open} onToggle={onToggle}>
      <View className="mt-3 rounded-xl bg-canvas p-4">
        <View className="flex-row items-center gap-3">
          <Icon as={on ? BellRing : BellOff} size={18} className={on ? "text-accent" : "text-ink-muted"} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-medium text-ink">Push notifications</Text>
            <Text className="text-xs text-ink-muted">
              {on ? "You'll hear about messages, follows, comments, gifts and sales." : blocked ? "Turned off for Akọ in your device settings." : "Off — you won't hear about new activity until you open the app."}
            </Text>
          </View>
        </View>

        {!on && (
          <Pressable onPress={() => (blocked ? void Linking.openSettings() : void handleEnable())} accessibilityRole="button" className="mt-3 items-center rounded-lg bg-cta py-2.5">
            <Text className="text-sm font-medium text-white">{blocked ? "Open device settings" : "Turn on notifications"}</Text>
          </Pressable>
        )}
        {on && (
          <View className="mt-3 rounded-lg border border-border p-3">
            <Text className="text-xs font-medium text-ink">Push status</Text>
            <Text className="mt-0.5 text-xs text-ink-muted">
              {pushStatus.error ? pushStatus.error : pushStatus.registered ? "This phone is registered for push." : "Registering this phone…"}
            </Text>
            <Pressable onPress={() => void handleTest()} disabled={testing} accessibilityRole="button" hitSlop={8} className="mt-2 self-start">
              <Text className="text-sm font-medium text-accent">{testing ? "Scheduling…" : "Send a test notification"}</Text>
            </Pressable>
          </View>
        )}
        {on && (
          <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button" className="mt-3 self-start" hitSlop={8}>
            <Text className="text-sm font-medium text-accent">{Platform.OS === "android" ? "Choose sounds and alerts in device settings" : "Manage in device settings"}</Text>
          </Pressable>
        )}
      </View>
    </SettingsSection>
  );
}
