// src/components/project/PrivateProjectNotice.tsx
import { Lock, MessageCircle } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";

export function PrivateProjectNotice({ onMessage, messagePending }: { onMessage: () => void; messagePending: boolean }) {
  return (
    <View className="mt-3 items-center rounded-xl border border-border bg-canvas px-4 py-6">
      <Icon as={Lock} size={22} className="mb-2 text-accent" />
      <Text className="text-sm font-medium text-ink">This project is private</Text>
      <Text className="mt-1 max-w-xs text-center text-xs text-ink-muted">
        Only people the creator has given access to can view this. Message them to ask for access.
      </Text>
      <Pressable
        onPress={onMessage}
        disabled={messagePending}
        accessibilityRole="button"
        className={`mt-4 flex-row items-center gap-1.5 rounded-full bg-accent px-4 py-2 ${messagePending ? "opacity-50" : ""}`}
      >
        <Icon as={MessageCircle} size={15} className="text-canvas" />
        <Text className="text-sm font-medium text-canvas">{messagePending ? "Opening…" : "Message for access"}</Text>
      </Pressable>
    </View>
  );
}
