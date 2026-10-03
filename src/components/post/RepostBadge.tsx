// src/components/post/RepostBadge.tsx
import { Repeat2 } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { RepostSource } from "@/types/database";

export function RepostBadge({ source }: { source: RepostSource | null | undefined }) {
  const [unavailable, setUnavailable] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function handlePress() {
    if (!source || source.is_deleted || source.is_archived) {
      setUnavailable(true);
      timer.current = setTimeout(() => setUnavailable(false), 2500);
      return;
    }
    router.push(`/post/${source.id}?view=post` as Href);
  }

  return (
    <View>
      <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Reshared — view original" hitSlop={8}>
        <Icon as={Repeat2} size={18} className="text-accent" />
      </Pressable>

      {unavailable ? (
        <View className="absolute right-0 top-full z-10 mt-1 rounded-lg bg-ink px-3 py-1.5">
          <Text className="text-xs text-canvas" numberOfLines={1} style={{ width: 168 }}>
            This post is no longer available
          </Text>
        </View>
      ) : null}
    </View>
  );
}
