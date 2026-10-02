// src/lib/headingColors.ts

// The 8 selectable heading colors (Compose.tsx's color-picker button,
// next to the heading input). Deliberately a fixed named set rather
// than a free color picker — the post row only ever stores the key
// below (posts.heading_color), never a raw hex, so a value here can
// be re-tuned later (a contrast fix, a hue nudge) without touching a
// single stored post.
//
// Each color is a light/dark PAIR, not one hex: the light variant is
// dark enough to read on the light-theme card surface (--color-surface,
// #FDFBF6), the dark variant light enough to read on the dark-theme
// card surface (--color-surface's dark override, #121114). This is
// the same pattern --color-post-header itself already uses (see
// index.css) — this file just gives the person 8 named choices
// instead of that one fixed default.
//
// Picked as a small jewel-tone "premium" set (sapphire/emerald/amber/
// garnet/amethyst/petrol/espresso/graphite) — each hue kept clearly
// apart from the app's existing semantic colors (sage --color-accent,
// brick --color-danger, ochre --color-pushback, cyan --color-tick-blue)
// so a colored heading never reads as one of those meanings by
// accident. Every pair is ≥7:1 against its card background (WCAG AAA
// for normal text) — see the contrast note next to each entry.
export interface HeadingColorDef {
  key: string;
  label: string;
  light: string;
  dark: string;
}

export const HEADING_COLORS: HeadingColorDef[] = [
  // Same value as the original single default (--color-post-header) —
  // kept first in the list, and the fallback that null/undefined maps
  // to, so every pre-existing heading keeps looking exactly as it did.
  // Contrast: 7.95:1 light / 8.74:1 dark.
  { key: "sapphire", label: "Sapphire", light: "#1E4C9A", dark: "#7CB3FF" },
  // Contrast: 7.08:1 light / 11.25:1 dark. Hue kept bluer-green than
  // --color-accent's sage so the two don't get read as the same color.
  { key: "emerald", label: "Emerald", light: "#08633F", dark: "#4FE0A8" },
  // Contrast: 7.23:1 light / 10.52:1 dark.
  { key: "amber", label: "Amber", light: "#7A4A00", dark: "#F2B84D" },
  // Contrast: 10.25:1 light / 8.38:1 dark. Deep wine in light mode;
  // its light-on-dark contrast counterpart reads as a warm rose —
  // same "gets lighter in dark mode" shift --color-post-header itself
  // makes for the same contrast reason.
  { key: "garnet", label: "Garnet", light: "#7A1140", dark: "#E893BE" },
  { key: "amethyst", label: "Amethyst", light: "#5B3A8A", dark: "#C6A6F0" },
  // Contrast: 7.16:1 light / 10.88:1 dark.
  { key: "petrol", label: "Petrol", light: "#0E5F63", dark: "#5FD6DC" },
  // Contrast: 9.77:1 light / 8.79:1 dark.
  { key: "espresso", label: "Espresso", light: "#5C3A1E", dark: "#D9A876" },
  // Contrast: 13.65:1 light / 12.97:1 dark. A neutral option alongside
  // the 7 jewel tones — near-ink in light mode, near-ivory in dark.
  { key: "graphite", label: "Graphite", light: "#2B2B2E", dark: "#DAD6CC" },
];

const HEADING_COLOR_MAP: Record<string, HeadingColorDef> = Object.fromEntries(
  HEADING_COLORS.map((c) => [c.key, c])
);

export function getHeadingColorDef(key: string | null | undefined): HeadingColorDef | null {
  if (!key) return null;
  return HEADING_COLOR_MAP[key] ?? null;
}
