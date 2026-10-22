// src/components/ui/BrandCard.tsx
//
// The one bold, filled surface on money screens (Wallet balance). Native twin of web's BrandCard.
//
// Colour rule: a filled brand surface uses a DEEP green/terracotta chosen to carry WHITE text, never the
// theme's bright accent with canvas-coloured text (in dark mode the accent is a bright mid-green and
// near-black text on it reads as a mistake). The web app has this as --color-cta; native has no such token,
// so the per-palette values live here (copied from web index.css: light #3D5A45, dark #377F5B; page mode
// light #A8501F, dark #A95D30). White on every one of them is >= 4.8:1.
//
// Depth is drawn with react-native-svg gradients (no new native module): a base fill that darkens toward the
// bottom, a soft top-right light, plus two faint concentric arcs and a hairline inner ring.
import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/theme/ThemeProvider";

const BASE: Record<string, string> = {
  "light:false": "#3D5A45",
  "dark:false": "#377F5B",
  "light:true": "#A8501F",
  "dark:true": "#A95D30",
};

/** White at a given opacity — card contents use these instead of `text-white/90` classes so the contrast stays explicit. */
export const ON_BRAND = {
  full: "#FFFFFF",
  high: "rgba(255,255,255,0.90)",
  chip: "rgba(255,255,255,0.15)",
  chipBorder: "rgba(255,255,255,0.25)",
  hairline: "rgba(255,255,255,0.15)",
} as const;

/** Deep brand colour for this theme — also used for text drawn on the white primary pill. */
export function useBrandColor(): string {
  const { resolvedTheme, pageMode } = useTheme();
  return BASE[`${resolvedTheme}:${pageMode}`] ?? BASE["light:false"];
}

function darken(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - t));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export function BrandCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const base = useBrandColor();
  return (
    <View
      className={`overflow-hidden rounded-[28px] ${className}`}
      style={{
        backgroundColor: base,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        shadowColor: base,
        shadowOpacity: 0.45,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 14 },
        elevation: 8,
      }}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        <Defs>
          <LinearGradient id="brandFill" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={base} />
            <Stop offset="0.45" stopColor={base} />
            <Stop offset="1" stopColor={darken(base, 0.38)} />
          </LinearGradient>
          <RadialGradient id="brandLight" cx="1" cy="0" rx="0.9" ry="0.7" fx="1" fy="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#brandFill)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#brandLight)" />
      </Svg>

      {/* Concentric arcs — decorative, clipped by the card. */}
      <View pointerEvents="none" style={{ position: "absolute", right: -64, top: -64, height: 224, width: 224, borderRadius: 112, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }} />
      <View pointerEvents="none" style={{ position: "absolute", right: -24, top: -24, height: 144, width: 144, borderRadius: 72, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }} />
      {children}
    </View>
  );
}
