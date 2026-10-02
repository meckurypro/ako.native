// src/app/+not-found.tsx
// Native port of web NotFound — shown for any link that matches no route.
import { Compass } from "lucide-react-native";
import { router } from "expo-router";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useSmartBack } from "@/hooks/useSmartBack";

export default function NotFound() {
  const smartBack = useSmartBack();
  return (
    <View className="flex-1 items-center justify-center bg-canvas px-6">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
        <Icon as={Compass} size={26} className="text-accent" />
      </View>
      <Text className="mb-1 font-display text-xl text-ink">Page not found</Text>
      <Text className="mb-6 max-w-xs text-center text-sm text-ink-muted">
        That link doesn't lead anywhere — it may be mistyped, or the thing it pointed to isn't there anymore.
      </Text>
      <View className="flex-row items-center gap-3">
        <Button size="sm" variant="secondary" onPress={smartBack}>
          Go back
        </Button>
        <Button size="sm" onPress={() => router.replace("/feed")}>
          Go to Feed
        </Button>
      </View>
    </View>
  );
}
