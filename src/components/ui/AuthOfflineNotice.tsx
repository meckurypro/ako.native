// src/components/ui/AuthOfflineNotice.tsx
// Shown at the top of every signed-out screen while there's no connection. The screens themselves still open — they're
// native, they don't need a network to appear — but logging in or creating an account does, so say so up front instead
// of letting someone fill in a form and fail at the end. Not a block: if the phone's idea of "offline" is wrong, the
// buttons still try, and a real failure gets the same plain message.
import { WifiOff } from "lucide-react-native";
import { View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useIsOnline } from "@/hooks/useIsOnline";

export function AuthOfflineNotice() {
  const online = useIsOnline();
  if (online) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" className="mb-6 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
      <Icon as={WifiOff} size={16} className="text-ink-muted" />
      <Text className="flex-1 text-sm text-ink-muted">You're offline. Connect to the internet to log in or create an account.</Text>
    </View>
  );
}
