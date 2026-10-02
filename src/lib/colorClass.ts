// src/lib/colorClass.ts
// A few places can't take a className: SVG fills, RN navigation chrome, a
// filled lucide icon… They need a raw colour. This resolves the app's own
// Tailwind colour classes (`text-danger`, `text-accent/60`, `text-white`…)
// against the live palette so call sites can keep the same class strings the
// web code uses and still follow dark mode / page mode.
import { overlay, type Palette } from "@/theme/palettes";

const OVERLAY_TOKENS: Record<string, string> = {
  "overlay-surface": overlay.surface,
  "overlay-surface-raised": overlay.surfaceRaised,
  "overlay-ink": overlay.ink,
  "overlay-ink-muted": overlay.inkMuted,
  "overlay-danger": overlay.danger,
  "overlay-danger-soft": overlay.dangerSoft,
  "overlay-accent": overlay.accent,
  "overlay-accent-soft": overlay.accentSoft,
};

function paletteTokens(p: Palette): Record<string, string> {
  return {
    canvas: p.canvas,
    surface: p.surface,
    ink: p.ink,
    "ink-muted": p.inkMuted,
    accent: p.accent,
    "accent-hover": p.accentHover,
    "accent-soft": p.accentSoft,
    border: p.border,
    danger: p.danger,
    pushback: p.pushback,
    "online-glow": p.onlineGlow,
    "tick-blue": p.tickBlue,
    "presence-online": p.presenceOnline,
    highlight: p.highlight,
    "post-header": p.postHeader,
    "bubble-mine": p.bubbleMine,
    "bubble-theirs": p.bubbleTheirs,
    "heading-emerald": p.headingEmerald,
    "heading-amber": p.headingAmber,
    "heading-garnet": p.headingGarnet,
    "heading-amethyst": p.headingAmethyst,
    "heading-petrol": p.headingPetrol,
    "heading-espresso": p.headingEspresso,
    "heading-graphite": p.headingGraphite,
    white: "#FFFFFF",
    black: "#000000",
    ...OVERLAY_TOKENS,
  };
}

function withOpacity(hex: string, opacityPercent: number): string {
  const clamped = Math.min(100, Math.max(0, opacityPercent));
  const alpha = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}

/**
 * Find the first `text-<token>[/opacity]` in a className and return its colour,
 * e.g. "text-danger" → "#A64B3F", "text-white/80" → "#FFFFFFCC".
 * Returns undefined when no colour class is present.
 */
export function textColorFromClassName(className: string | undefined, palette: Palette): string | undefined {
  if (!className) return undefined;
  const tokens = paletteTokens(palette);
  for (const cls of className.split(/\s+/)) {
    const m = /^text-([a-z-]+)(?:\/(?:\[(\d*\.?\d+)\]|(\d+)))?$/.exec(cls);
    if (!m) continue;
    const base = tokens[m[1]];
    if (!base) continue;
    const bracket = m[2] !== undefined ? parseFloat(m[2]) * 100 : undefined; // text-ink/[0.07] → 7
    const plain = m[3] !== undefined ? parseInt(m[3], 10) : undefined; // text-white/80 → 80
    const opacity = bracket ?? plain;
    return opacity === undefined ? base : withOpacity(base, opacity);
  }
  return undefined;
}
