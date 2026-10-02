// src/components/ui/OverlayPanel.tsx
// The fixed dark-glass chrome shared by every dismissible surface (Modal,
// DropdownMenu, bottom sheets) — port of .ako-overlay-panel. Deliberately
// theme-independent: a confirmation looks identical in light, dark and page
// mode, with light text on a near-black panel.
import { View, type ViewProps } from "react-native";

export function OverlayPanel({ style, className = "", ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={`border border-overlay-border bg-overlay-surface/95 ${className}`}
      style={[
        {
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

/** Dim scrim behind overlays (bg-black/40; the web build's 1.2px blur is imperceptible, so it's skipped). */
export const SCRIM_CLASS = "absolute inset-0 bg-black/40";
