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

const HEIGHT = 20; // h-5, same as the web mark

export function AkoWatermark() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  // Explicit width AND height. With only height + aspectRatio inside a
  // stretch-aligned wrapper, the box could resolve far taller than 20 and
  // stretch the whole post header (name row is vertically centred against it).
  const width = Math.round(HEIGHT * (dark ? DARK_RATIO : LIGHT_RATIO));
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width, height: HEIGHT, flexShrink: 0 }}
    >
      <Image source={dark ? DARK : LIGHT} contentFit="contain" style={{ width, height: HEIGHT, opacity: 0.9 }} />
    </View>
  );
}
