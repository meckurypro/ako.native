// src/components/ui/OverlayPanel.tsx
// The fixed dark-glass chrome shared by every dismissible surface (Modal,
// DropdownMenu, bottom sheets) — port of .ako-overlay-panel. Deliberately
// theme-independent: a confirmation looks identical in light, dark and page
// mode, with light text on a near-black panel.
import { View, type ViewProps } from "react-native";

import { overlay } from "@/theme/palettes";
import { useTheme } from "@/theme/ThemeProvider";

export function OverlayPanel({ style, className = "", ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={className}
      style={[
        {
          // Inline, not bg-overlay-surface/95: opacity-modified colour classes
          // resolved to NO background on device, so panels rendered see-through.
          // Web: rgba(overlay-surface, 0.96) + 1px overlay-border.
          backgroundColor: `${overlay.surface}F5`,
          borderWidth: 1,
          borderColor: overlay.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 20 },
          shadowOpacity: 0.5,
          shadowRadius: 24,
          elevation: 24,
        },
        style,
      ]}
      {...rest}
    />
  );
}

/** Dim scrim behind overlays (web: bg-black/40; its 1.2px blur is imperceptible, so it's skipped). Inline style — the bg-black/40 class didn't render. */
export const SCRIM_STYLE = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" } as const;

/**
 * Theme-tinted scrim colours matching the web backdrops. Built as hex + alpha and applied
 * INLINE — `bg-canvas/70`-style classes resolve to no background on device.
 *   canvas   web: bg-canvas/70  (bottom sheets, composers)
 *   canvasLight web: bg-canvas/50 (comments sheet)
 *   ink      web: bg-ink/40     (project sheets)
 * Web also adds a 1.2px backdrop blur, which is imperceptible and skipped here.
 */
export type ScrimTone = "canvas" | "canvasLight" | "canvasFaint" | "ink";
// canvasFaint = web LoadingOverlay: bg-canvas/35
const SCRIM_ALPHA: Record<ScrimTone, string> = { canvas: "B3", canvasLight: "80", canvasFaint: "59", ink: "66" };
export function scrimColor(tone: ScrimTone, colors: { canvas: string; ink: string }): string {
  return `${tone === "ink" ? colors.ink : colors.canvas}${SCRIM_ALPHA[tone]}`;
}

/**
 * The themed floating card web uses for anchored popovers (reaction options, collaborators badge,
 * heading colour picker): `bg-surface|bg-canvas border border-border rounded-* shadow-lg`. Unlike
 * OverlayPanel it follows the light/dark theme. `darkGlass` = the colour picker's
 * `dark:bg-[#1C1C1E] dark:border-overlay-border` variant.
 */
export function PopoverPanel({
  style,
  className = "",
  tone = "surface",
  darkGlass = false,
  ...rest
}: ViewProps & { className?: string; tone?: "surface" | "canvas"; darkGlass?: boolean }) {
  const { colors, resolvedTheme } = useTheme();
  const glass = darkGlass && resolvedTheme === "dark";
  return (
    <View
      className={className}
      style={[
        {
          backgroundColor: glass ? overlay.surface : tone === "canvas" ? colors.canvas : colors.surface,
          borderWidth: 1,
          borderColor: glass ? overlay.border : colors.border,
          // shadow-lg
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.12,
          shadowRadius: 15,
          elevation: 8,
        },
        style,
      ]}
      {...rest}
    />
  );
}
