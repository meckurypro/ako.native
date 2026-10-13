// src/components/ui/GlassScrim.tsx
// Web's `bg-canvas/70 backdrop-blur-overlay` scrim: real blur of what's beneath plus the theme tint.
// Fill its parent (absolute). Needs a layer at zIndex >= GLASS_ABOVE_Z so the blur target is beneath it.
import { BlurView } from "expo-blur";
import { StyleSheet, View } from "react-native";

import { OVERLAY_BLUR_INTENSITY } from "@/theme/blur";
import { useTheme } from "@/theme/ThemeProvider";
import { scrimColor, type ScrimTone } from "./OverlayPanel";
import { useOverlayBlurTarget } from "./Portal";

export function GlassScrim({ tone = "canvas" }: { tone?: ScrimTone }) {
  const { colors, resolvedTheme } = useTheme();
  const blurTarget = useOverlayBlurTarget();
  return (
    <>
      <BlurView
        pointerEvents="none"
        intensity={OVERLAY_BLUR_INTENSITY}
        tint={resolvedTheme === "dark" ? "dark" : "light"}
        blurTarget={blurTarget ?? undefined}
        blurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor(tone, colors) }]} />
    </>
  );
}
