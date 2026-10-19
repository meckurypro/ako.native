// src/components/discover/SectionHeader.tsx
// One heading style for every Discover section, so the page reads as a single
// calm surface: display-font title, one quiet line beneath.
import { View } from "react-native";

import { Text } from "@/components/ui/Text";

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="mb-3">
      <Text className="font-display text-lg text-ink">{title}</Text>
      {subtitle ? <Text className="mt-0.5 text-sm text-ink-muted">{subtitle}</Text> : null}
    </View>
  );
}
