// src/components/ui/InfoNote.tsx
// Tinted explanatory callout with an info icon.
import { Info } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon } from "./styled";
import { Text } from "./Text";

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <View className="mb-4 flex-row gap-2.5 rounded-xl bg-accent-soft/60 p-4">
      <View className="mt-0.5 shrink-0">
        <Icon as={Info} size={16} className="text-accent" />
      </View>
      <Text className="flex-1 text-sm text-ink-muted">{children}</Text>
    </View>
  );
}
