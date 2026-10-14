// src/lib/contrast.ts
// WCAG helpers so a filled button carrying white text stays readable in every palette.

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function parse(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio of white text on `hex`. */
export function contrastWithWhite(hex: string): number {
  const rgb = parse(hex);
  return rgb ? 1.05 / (luminance(rgb) + 0.05) : 21;
}

/**
 * The palette accent, darkened (mixed toward black — same hue) only as far as needed for white text to reach
 * `min`:1. Light-mode greens/oranges come back untouched; dark mode's bright accent (#4CAE7C, 2.7:1) is darkened.
 */
export function ctaFill(accent: string, min = 4.8): string {
  const rgb = parse(accent);
  if (!rgb || contrastWithWhite(accent) >= min) return accent;
  for (let p = 0.01; p <= 0.6; p += 0.01) {
    const c = rgb.map((v) => Math.round(v * (1 - p))) as [number, number, number];
    const hex = `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    if (contrastWithWhite(hex) >= min) return hex;
  }
  return "#000000";
}
