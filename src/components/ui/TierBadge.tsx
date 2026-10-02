// src/components/ui/TierBadge.tsx
import { View } from "react-native";

import type { Tier } from "@/types/database";
import { Text } from "./Text";

const TIER_LABELS: Record<Tier, string | null> = {
  newcomer: null, // no badge for the default tier — avoid visual noise
  contributor: "Contributor",
  publisher: "Publisher",
  host: "Host",
  creator_business: "Creator",
};

export function TierBadge({ tier }: { tier: Tier }) {
  const label = TIER_LABELS[tier];
  if (!label) return null;

  return (
    <View className="self-start rounded-full bg-accent-soft px-2 py-0.5">
      <Text className="text-xs font-medium text-accent">{label}</Text>
    </View>
  );
}
