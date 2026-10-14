// src/components/page/PageActionBlocked.tsx
// Shown instead of a creation screen when the person is acting as a page but
// their role on it doesn't include that action. The server refuses the action
// too — this just explains it instead of failing after they've typed.
import { router, type Href } from "expo-router";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useSwitchActiveMode } from "@/hooks/usePages";

export function PageActionBlocked({ pageName, action }: { pageName: string; action: string }) {
  const switchMode = useSwitchActiveMode();

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="" />
      <View className="flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-center text-ink">
          You don't have permission to {action} as {pageName}.
        </Text>
        <Text className="text-center text-sm text-ink-muted">
          Ask a {pageName} admin to change your permissions, or switch back to your personal account.
        </Text>
        <Button onPress={() => switchMode.mutate(null, { onSuccess: () => router.replace("/me" as Href) })} loading={switchMode.isPending} className="w-full py-2.5">
          Switch to personal account
        </Button>
      </View>
    </View>
  );
}
