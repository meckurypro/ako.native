// src/components/ui/AkoWatermark.tsx
// Subtle brand mark in a post card's top-right corner. Purely for screenshots:
// when a post is shared outside the app, this is the only thing in the image
// that still says "Akọ". Uses the theme-paired tagline-free artwork (the
// "dark" file is tuned bright for dark cards, "light" muted for light ones).
//
// PostCard decides when NOT to render it: archived-frozen cards (Restore/Delete
// own that corner) and plain reshares (RepostBadge owns it there).
import { View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { Image } from "./styled";

const LIGHT = require("../../../assets/images/app-icon-light-without-tagline.png");
const DARK = require("../../../assets/images/app-icon-dark-without-tagline.png");
const LIGHT_RATIO = 1620 / 821;
const DARK_RATIO = 1536 / 826;

export function AkoWatermark() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no">
      <Image
        source={dark ? DARK : LIGHT}
        contentFit="contain"
        style={{ height: 20, aspectRatio: dark ? DARK_RATIO : LIGHT_RATIO, opacity: 0.9 }}
      />
    </View>
  );
}
