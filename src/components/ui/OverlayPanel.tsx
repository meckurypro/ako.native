// src/components/ui/OverlayPanel.tsx
// The fixed dark-glass chrome shared by every dismissible surface (Modal,
// DropdownMenu, bottom sheets) — port of .ako-overlay-panel. Deliberately
// theme-independent: a confirmation looks identical in light, dark and page
// mode, with light text on a near-black panel.
import { View, type ViewProps } from "react-native";

import { overlay } from "@/theme/palettes";

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
