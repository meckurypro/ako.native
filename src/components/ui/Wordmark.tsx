// src/components/ui/Wordmark.tsx
// The Akọ brand mark — icon only (the mark itself reads as "Akọ"). Swaps
// between the light/dark artwork with the resolved theme.
import { View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { Image } from "./styled";

const LIGHT = require("../../../assets/images/app-icon-light-without-tagline.png");
const DARK = require("../../../assets/images/app-icon-dark-without-tagline.png");

// Intrinsic aspect ratios of the two source files (w / h).
const LIGHT_RATIO = 1620 / 821;
const DARK_RATIO = 1536 / 826;

export function Wordmark({ size = "lg" }: { size?: "sm" | "lg" }) {
  const { resolvedTheme } = useTheme();
  const height = size === "lg" ? 96 : 36; // h-24 / h-9
  const dark = resolvedTheme === "dark";

  return (
    <View className="items-center">
      <Image
        source={dark ? DARK : LIGHT}
        accessibilityLabel="Akọ"
        contentFit="contain"
        style={{ height, aspectRatio: dark ? DARK_RATIO : LIGHT_RATIO }}
      />
    </View>
  );
}
