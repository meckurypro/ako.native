// src/components/project/FeedDoorway.tsx
// Soft "see what else is on Akọ" invitation shown at natural stopping points
// (course complete, book, ticket). Purely presentational; frequency policy lives
// in useFeedDoorway.
import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { FEED_DOORWAY_COPY, type FeedDoorwayContextKey } from "@/lib/feedDoorwayCopy";

interface FeedDoorwayProps {
  context: FeedDoorwayContextKey;
  onEnter: () => void;
  className?: string;
}

export function FeedDoorway({ context, onEnter, className = "" }: FeedDoorwayProps) {
  const copy = FEED_DOORWAY_COPY[context];
  return (
    <View className={`mt-4 border-t border-border pt-4 ${className}`}>
      <Text className="text-sm font-medium text-ink">{copy.heading}</Text>
      <Text className="mt-0.5 text-sm text-ink-muted">{copy.subtext}</Text>
      <Pressable
        onPress={() => {
          onEnter();
          router.push("/feed");
        }}
        accessibilityRole="link"
        className="mt-2 flex-row items-center gap-1 self-start"
      >
        <Text className="text-sm font-medium text-accent">{copy.cta}</Text>
        <Icon as={ArrowRight} size={14} className="text-accent" />
      </Pressable>
    </View>
  );
}
