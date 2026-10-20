// src/components/ui/BadgeStreakNote.tsx
//
// The posting-streak rule behind the Verified badge, shown to the account
// owner on their own profile only. Verified status itself is permanent
// (admin-assigned); the badge only SHOWS while the owner has posted at least
// once in each of the last four 7-day windows. `streak` is profiles.badge_streak
// (0–4, owner-only; null for admins and unverified accounts, which render nothing).
import { View } from "react-native";

import { Text } from "./Text";
import { useVerifiedColors } from "./VerifiedBadge";

// Filled bars are shades of the Verified badge's blue: lightest first, each step more saturated,
// the 4th at full strength == the badge itself.
const STEP_OPACITY = [0.35, 0.55, 0.78, 1];

export function BadgeStreakNote({ visible, streak }: { visible: boolean; streak: number }) {
  const verified = useVerifiedColors();
  const copy = visible
    ? "Post at least once every week to keep your badge."
    : "Badge hidden. Post every week for 4 weeks to bring it back.";

  return (
    <View className="mt-1.5 flex-row items-center gap-2" accessibilityRole="text" accessibilityLabel={`${streak} of 4 weeks. ${copy}`}>
      <View className="flex-row gap-1">
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            className={`h-1.5 w-4 rounded-full ${i < streak ? "" : "bg-border"}`}
            style={i < streak ? { backgroundColor: verified.to, opacity: STEP_OPACITY[i] } : undefined}
          />
        ))}
      </View>
      <Text className="flex-shrink text-xs text-ink-muted">{copy}</Text>
    </View>
  );
}
