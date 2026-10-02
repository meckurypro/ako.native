// src/components/ui/PatternBackground.tsx
// Tiled, theme-tinted texture. The web draws these as big inline SVG
// <pattern> fills (the chat wallpaper alone is ~900 <use> nodes). On native
// that would mean ~900 live SVG views, so each pattern is rendered ONCE to a
// transparent PNG tile (assets/patterns/, 1x/2x/3x) and tiled with
// resizeMode="repeat". The tile is black-on-transparent; `tintColor` recolours
// it to the live ink colour, so dark mode and page mode still re-theme it.
import { useState } from "react";
import { Image, View, type ImageSourcePropType } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

interface PatternBackgroundProps {
  tile: ImageSourcePropType;
  /** Overall strength, e.g. 0.045 for the chat wallpaper, 0.07 for the auth grid. */
  opacity: number;
}

export function PatternBackground({ tile, opacity }: PatternBackgroundProps) {
  const { colors } = useTheme();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}
    >
      {/* Explicit pixel size: Android only tiles `repeat` images with a concrete frame. */}
      {size ? (
        <Image
          source={tile}
          resizeMode="repeat"
          style={{ width: size.width, height: size.height, tintColor: colors.ink, opacity }}
        />
      ) : null}
    </View>
  );
}
