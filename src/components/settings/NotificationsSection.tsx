// src/components/settings/NotificationsSection.tsx
// Push notification status + the one action that applies: ask (not yet asked), ask again (Android, soft
// denial), or jump to system Settings (the only place a blocked permission can be changed).
import { Bell, BellOff, BellRing } from "lucide-react-native";
import { Linking, Platform, Pressable, View } from "react-native";

import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { usePushPermission } from "@/lib/pushPermissionStore";

export function NotificationsSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { status, canAskAgain, request } = usePushPermission();
  const toast = useToast();
  const on = status === "granted";
  const blocked = status === "denied" && !canAskAgain;

  async function handleEnable() {
    const result = await request();
    if (result.status !== "granted") toast("Notifications are still off.", { variant: "error" });
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
          <Pressable onPress={() => (blocked ? void Linking.openSettings() : void handleEnable())} accessibilityRole="button" className="mt-3 items-center rounded-lg bg-accent py-2.5">
            <Text className="text-sm font-medium text-canvas">{blocked ? "Open device settings" : "Turn on notifications"}</Text>
          </Pressable>
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
