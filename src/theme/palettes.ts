// File: src/theme/palettes.ts
// Single source of truth for theme tokens, ported from the web app's
// src/index.css (@theme, .dark, .page-mode, .dark.page-mode).
// ThemeProvider turns the active palette into runtime CSS variables so every
// `bg-canvas` / `text-ink` / `border-border` class re-themes with zero
// component changes — same trick the web app uses with its `.dark` class.

export type ColorScheme = "light" | "dark";

export interface Palette {
  canvas: string;
  surface: string;
  ink: string;
  inkMuted: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  border: string;
  danger: string;
  pushback: string;
  onlineGlow: string;
  tickBlue: string;
  presenceOnline: string;
  highlight: string;
  postHeader: string;
  bubbleMine: string;
  bubbleTheirs: string;
  headingEmerald: string;
  headingAmber: string;
  headingGarnet: string;
  headingAmethyst: string;
  headingPetrol: string;
  headingEspresso: string;
  headingGraphite: string;
  /** rgb triplets for manually-built shadows/glows ("r, g, b") */
  shadowInkRgb: string;
  accentRgb: string;
}

const light: Palette = {
  canvas: "#F7F4EF",
  surface: "#FDFBF6",
  ink: "#1F1D1A",
  inkMuted: "#6B675F",
  accent: "#3D5A45",
  accentHover: "#2F4636",
  accentSoft: "#E3E9E1",
  border: "#E9E4D8",
  danger: "#A64B3F",
  pushback: "#B8862E",
  onlineGlow: "#FF6A00",
  tickBlue: "#53BDEB",
  presenceOnline: "#39FF6A",
  highlight: "#BFE6C6",
  postHeader: "#1E4C9A",
  bubbleMine: "#3D5A45",
  bubbleTheirs: "#FFFFFF",
  headingEmerald: "#08633F",
  headingAmber: "#7A4A00",
  headingGarnet: "#7A1140",
  headingAmethyst: "#5B3A8A",
  headingPetrol: "#0E5F63",
  headingEspresso: "#5C3A1E",
  headingGraphite: "#2B2B2E",
  shadowInkRgb: "31, 29, 26",
  accentRgb: "61, 90, 69",
};

const dark: Palette = {
  ...light,
  canvas: "#0C0C0B",
  surface: "#131311",
  ink: "#F9F8F5",
  inkMuted: "#ADA99E",
  accent: "#4CAE7C",
  accentHover: "#63C695",
  accentSoft: "#17281F",
  border: "#232220",
  danger: "#C97C6B",
  pushback: "#D9A857",
  highlight: "#1E4B31",
  postHeader: "#7CB3FF",
  bubbleMine: "#2F4636",
  bubbleTheirs: "#1D1D1A",
  headingEmerald: "#4FE0A8",
  headingAmber: "#F2B84D",
  headingGarnet: "#E893BE",
  headingAmethyst: "#C6A6F0",
  headingPetrol: "#5FD6DC",
  headingEspresso: "#D9A876",
  headingGraphite: "#DAD6CC",
  shadowInkRgb: "0, 0, 0",
  accentRgb: "76, 174, 124",
};

// Page mode: burnt-orange identity used when acting as a Page (see web
// usePageThemeSync). danger/pushback/tick-blue/presence stay untouched on
// purpose — they are semantic, not identity.
const pageLight: Palette = {
  ...light,
  canvas: "#F9F1E6",
  surface: "#FCF6EC",
  ink: "#241C15",
  inkMuted: "#7C6A57",
  accent: "#A8501F",
  accentHover: "#7E3B16",
  accentSoft: "#F0DCC9",
  border: "#EDDFCB",
  highlight: "#F0C08A",
  bubbleMine: "#A8501F",
  bubbleTheirs: "#FFFBF3",
  shadowInkRgb: "36, 28, 21",
  accentRgb: "168, 80, 31",
};

const pageDark: Palette = {
  ...dark,
  canvas: "#100B08",
  surface: "#17110C",
  ink: "#F8F1E8",
  inkMuted: "#BBA895",
  accent: "#D9773D",
  accentHover: "#EF9159",
  accentSoft: "#2B1912",
  border: "#2E2015",
  highlight: "#5C3018",
  bubbleMine: "#7E3B16",
  bubbleTheirs: "#211913",
  shadowInkRgb: "0, 0, 0",
  accentRgb: "217, 119, 61",
};

export function getPalette(scheme: ColorScheme, pageMode: boolean): Palette {
  if (pageMode) return scheme === "dark" ? pageDark : pageLight;
  return scheme === "dark" ? dark : light;
}

/** Overlay chrome is theme-independent (fixed dark glass), exactly like web. */
export const overlay = {
  surface: "#1C1C1E",
  surfaceRaised: "#2C2C2E",
  ink: "#F5F5F7",
  inkMuted: "#98989D",
  border: "rgba(255,255,255,0.12)",
  danger: "#D6968A",
  dangerSoft: "#4A2E2A",
  accent: "#8FB89C",
  accentSoft: "#263831",
  surfaceRgb: "28, 28, 30",
} as const;

/** Palette → CSS custom properties consumed by the generated utilities. */
export function paletteToCssVars(p: Palette): Record<`--${string}`, string> {
  return {
    "--color-canvas": p.canvas,
    "--color-surface": p.surface,
    "--color-ink": p.ink,
    "--color-ink-muted": p.inkMuted,
    "--color-accent": p.accent,
    "--color-accent-hover": p.accentHover,
    "--color-accent-soft": p.accentSoft,
    "--color-border": p.border,
    "--color-danger": p.danger,
    "--color-pushback": p.pushback,
    "--color-online-glow": p.onlineGlow,
    "--color-tick-blue": p.tickBlue,
    "--color-presence-online": p.presenceOnline,
    "--color-highlight": p.highlight,
    "--color-post-header": p.postHeader,
    "--color-bubble-mine": p.bubbleMine,
    "--color-bubble-theirs": p.bubbleTheirs,
    "--color-heading-emerald": p.headingEmerald,
    "--color-heading-amber": p.headingAmber,
    "--color-heading-garnet": p.headingGarnet,
    "--color-heading-amethyst": p.headingAmethyst,
    "--color-heading-petrol": p.headingPetrol,
    "--color-heading-espresso": p.headingEspresso,
    "--color-heading-graphite": p.headingGraphite,
  };
}
