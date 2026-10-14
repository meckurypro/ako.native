// src/components/ui/GlassScrim.tsx
// Web's `bg-canvas/70 backdrop-blur-overlay` scrim: real blur of what's beneath plus the theme tint.
// Fill its parent (absolute). Needs a layer at zIndex >= GLASS_ABOVE_Z so the blur target is beneath it.
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";

import { OVERLAY_BLUR_INTENSITY } from "@/theme/blur";
import { useTheme } from "@/theme/ThemeProvider";
import { scrimColor, type ScrimTone } from "./OverlayPanel";
import { useLayerBlurRole, useOverlayBlurTarget, useScreenBlurTarget } from "./Portal";

export function GlassScrim({ tone = "canvas", intensity = OVERLAY_BLUR_INTENSITY }: { tone?: ScrimTone; intensity?: number }) {
  const { colors, resolvedTheme } = useTheme();
  const role = useLayerBlurRole();
  const glassTarget = useOverlayBlurTarget();
  const screenTarget = useScreenBlurTarget();

  // See LayerBlurRole in Portal.tsx. Android needs a target that doesn't contain this BlurView.
  const blurTarget = role === "screen" ? screenTarget : glassTarget;
  const canBlur = Platform.OS !== "android" || role !== "stacked";

  return (
    <>
      {canBlur ? (
        <BlurView
          pointerEvents="none"
          intensity={intensity}
          tint={resolvedTheme === "dark" ? "dark" : "light"}
          blurTarget={blurTarget ?? undefined}
          blurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor(tone, colors) }]} />
    </>
  );
}
