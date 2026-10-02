// src/components/ui/VerifiedBadge.tsx
import { Check } from "lucide-react-native";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "./styled";
import { Text } from "./Text";

function BadgeIcon({ size }: { size: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: colors.accent,
        shadowOpacity: 0.55,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
      }}
    >
      {/* 135° gradient: accent-hover → accent */}
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id="verifiedGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.accentHover} />
            <Stop offset="1" stopColor={colors.accent} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} fill="url(#verifiedGradient)" />
      </Svg>
      <Icon as={Check} size={Math.round(size * 0.62)} strokeWidth={3.25} className="text-white" />
    </View>
  );
}

export function VerifiedBadge({
  size = 15,
  className = "",
  label = false,
}: {
  size?: number;
  className?: string;
  label?: boolean;
}) {
  if (!label) {
    return (
      <View accessibilityRole="image" accessibilityLabel="Verified" className={className}>
        <BadgeIcon size={size} />
      </View>
    );
  }

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Verified"
      className={`flex-row items-center gap-1.5 self-start rounded-full bg-accent-soft py-1 pl-1 pr-2.5 ${className}`}
    >
      <BadgeIcon size={size} />
      <Text className="text-[13px] font-semibold text-accent">Verified</Text>
    </View>
  );
}
