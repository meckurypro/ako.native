// src/components/ui/RestrictedPostNotice.tsx
// Native counterpart of web RestrictedPostNotice. Shown in place of a post (or comment thread) when a
// restricted (consumer-only) account follows a shared link to one. Those accounts can't use feeds or posts
// yet, so the honest answer is NOT "this post doesn't exist" — it does. Explain gently and point them to
// Discover, their home surface. Server-side enforcement is unchanged; this is only the messaging layer.
import { Compass, Lock } from "lucide-react-native";
import { useRouter, type Href } from "expo-router";
import { View } from "react-native";

import { RESTRICTED_HOME } from "@/hooks/useAccountAccess";

import { Button } from "./Button";
import { Icon } from "./styled";
import { Text } from "./Text";

export function RestrictedPostNotice() {
  const router = useRouter();

  return (
    <View className="items-center px-6 py-16">
      <View className="mb-3 h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
        <Icon as={Lock} size={20} className="text-ink-muted" />
      </View>
      <Text className="mb-1 text-center font-medium text-ink">Posts aren't available on your account yet</Text>
      <Text className="mb-6 text-center text-sm text-ink-muted">
        Your current account tier can't view feeds or posts just yet. In the meantime, there's plenty to explore on
        Discover — projects, books, courses and more.
      </Text>
      <View className="w-full max-w-xs">
        <Button onPress={() => router.replace(RESTRICTED_HOME as Href)}>
          <View className="flex-row items-center gap-2">
            <Icon as={Compass} size={18} className="text-white" />
            <Text className="font-medium text-white">Go to Discover</Text>
          </View>
        </Button>
      </View>
    </View>
  );
}
