// src/components/post/OfflineFeedNotice.tsx
// What a post list shows when it has NOTHING to display and the reason is the connection, not an empty feed. Without
// this the feed said "No posts yet. Be the first to share a thought." — a claim about the world made from a request
// that never ran. Posts already on the device still show as normal; this only appears when there are none.
import { WifiOff } from "lucide-react-native";
import { View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";

export function OfflineFeedNotice({ onRetry, reachable }: { onRetry?: () => void; reachable?: boolean }) {
  return (
    <View className="items-center gap-3 px-6 py-16">
      <Icon as={WifiOff} size={28} className="text-ink-muted" />
      <Text className="text-center text-base text-ink">{reachable === false ? "Can't reach Ako right now" : "You're offline"}</Text>
      <Text className="max-w-xs text-center text-sm text-ink-muted">
        {reachable === false
          ? "Posts couldn't be loaded. Check your connection and try again."
          : "Posts will load when you're back online. Anything you've downloaded is in your Library."}
      </Text>
      {onRetry ? (
        <View className="mt-2 w-40">
          <Button variant="secondary" onPress={onRetry}>
            Try again
          </Button>
        </View>
      ) : null}
    </View>
  );
}
