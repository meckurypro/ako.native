// src/components/ui/VerifiedBadge.tsx
//
// Always BLUE (not the green/peach accent): a trust mark with its own per-theme tokens — a deeper
// saturated blue on light, a brighter blue on dark — so it holds contrast on either canvas.
// Shape: smooth 8-lobe rosette + vertical gloss + bold rounded check. Mirrors the web component.
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

const VERIFIED = {
  light: { from: "#2E9BFF", to: "#0A5BEA", glow: "#0A5BEA", soft: "rgba(10, 91, 234, 0.10)", text: "#0A55D6" },
  dark: { from: "#45A5FF", to: "#2272F6", glow: "#45A5FF", soft: "rgba(69, 165, 255, 0.16)", text: "#7CC0FF" },
} as const;

// 8-lobe rosette, r(θ) = R·(1 + 0.085·cos 8θ) in a 24×24 box — smooth, no hard points.
const ROSETTE =
  "M12.00 0.28 L12.76 0.43 L13.47 0.84 L14.11 1.41 L14.68 2.01 L15.22 2.53 L15.78 2.87 L16.43 3.03 L17.17 3.04 L18.00 3.02 L18.85 3.07 L19.65 3.28 L20.29 3.71 L20.72 4.35 L20.93 5.15 L20.98 6.00 L20.96 6.83 L20.97 7.57 L21.13 8.22 L21.47 8.78 L21.99 9.32 L22.59 9.89 L23.16 10.53 L23.57 11.24 L23.72 12.00 L23.57 12.76 L23.16 13.47 L22.59 14.11 L21.99 14.68 L21.47 15.22 L21.13 15.78 L20.97 16.43 L20.96 17.17 L20.98 18.00 L20.93 18.85 L20.72 19.65 L20.29 20.29 L19.65 20.72 L18.85 20.93 L18.00 20.98 L17.17 20.96 L16.43 20.97 L15.78 21.13 L15.22 21.47 L14.68 21.99 L14.11 22.59 L13.47 23.16 L12.76 23.57 L12.00 23.72 L11.24 23.57 L10.53 23.16 L9.89 22.59 L9.32 21.99 L8.78 21.47 L8.22 21.13 L7.57 20.97 L6.83 20.96 L6.00 20.98 L5.15 20.93 L4.35 20.72 L3.71 20.29 L3.28 19.65 L3.07 18.85 L3.02 18.00 L3.04 17.17 L3.03 16.43 L2.87 15.78 L2.53 15.22 L2.01 14.68 L1.41 14.11 L0.84 13.47 L0.43 12.76 L0.28 12.00 L0.43 11.24 L0.84 10.53 L1.41 9.89 L2.01 9.32 L2.53 8.78 L2.87 8.22 L3.03 7.57 L3.04 6.83 L3.02 6.00 L3.07 5.15 L3.28 4.35 L3.71 3.71 L4.35 3.28 L5.15 3.07 L6.00 3.02 L6.83 3.04 L7.57 3.03 L8.22 2.87 L8.78 2.53 L9.32 2.01 L9.89 1.41 L10.53 0.84 L11.24 0.43Z";
const CHECK = "M7.7 12.5 L10.6 15.4 L16.4 9.1";

function useVerifiedColors() {
  const { resolvedTheme } = useTheme();
  return VERIFIED[resolvedTheme === "dark" ? "dark" : "light"];
}

function BadgeIcon({ size }: { size: number }) {
  const c = useVerifiedColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        shadowColor: c.glow,
        shadowOpacity: 0.45,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id="verifiedFill" x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={c.from} />
            <Stop offset="1" stopColor={c.to} />
          </LinearGradient>
          <LinearGradient id="verifiedGloss" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.32} />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={ROSETTE} fill="url(#verifiedFill)" />
        <Path d={ROSETTE} fill="url(#verifiedGloss)" />
        <Path d={CHECK} fill="none" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

export function VerifiedBadge({
  size = 16,
  className = "",
  label = false,
}: {
  size?: number;
  className?: string;
  label?: boolean;
}) {
  const c = useVerifiedColors();

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
      className={`flex-row items-center gap-1.5 self-start rounded-full py-1 pl-1 pr-2.5 ${className}`}
      style={{ backgroundColor: c.soft }}
    >
      <BadgeIcon size={size} />
      <Text className="text-[13px] font-semibold" style={{ color: c.text }}>
        Verified
      </Text>
    </View>
  );
}
