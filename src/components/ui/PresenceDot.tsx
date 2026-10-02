// src/components/ui/PresenceDot.tsx
import { View } from "react-native";

import { getPresenceStatus } from "@/lib/presence";
import { useTheme } from "@/theme/ThemeProvider";

export function PresenceDot({
  lastSeenAt,
  size = 11,
}: {
  lastSeenAt: string | null | undefined;
  /** Diameter in px. */
  size?: number;
}) {
  const { colors } = useTheme();
  const status = getPresenceStatus(lastSeenAt);

  const color =
    status === "online" ? colors.presenceOnline : status === "recent" ? colors.onlineGlow : colors.inkMuted;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: status === "offline" ? 0.3 : 1,
        // Soft glow (iOS shadow; Android has no coloured shadow, the dot stays crisp)
        ...(status !== "offline"
          ? { shadowColor: color, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }
          : null),
      }}
    />
  );
}
