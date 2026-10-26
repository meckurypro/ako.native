// File: src/lib/imagePalette.ts
// Pulls a Primary / Secondary / Accent brand palette out of an image — no AI, no upload; it all runs on the phone.
// Native twin of the web imagePalette: the clustering and role-assigning below are the same code, so the same picture
// gives the same three colours on both. Only the pixel reading differs (web draws to a canvas; here the image is
// shrunk with expo-image-manipulator and its PNG bytes are decoded in JS).
//
// Method (the standard approach used by palette tools):
//   1. Decode and shrink the image to ≤ 96 px on its long side, so the work is fast and tiny details/noise wash out.
//   2. Skip transparent pixels, and bucket the rest in a 4-bit-per-channel histogram.
//   3. Cluster the buckets with weighted k-means in CIELAB (distance there matches how different two colours look).
//   4. Give the clusters their jobs:
//        Secondary — the page background, so the calm, dominant, low-saturation colour of the image.
//        Primary   — buttons and headings, so the most vivid colour that is also prominent, and readable on Secondary.
//        Accent    — the highlight, so the next vivid colour that is clearly different from both.
//      Anything missing (a greyscale photo, a one-colour logo) is derived from what was found, never left blank.
import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "fast-png";

import { rgbToHex } from "./colorMath";
import type { LocalFile } from "./localFile";

export interface ImagePalette {
  primary: string;
  secondary: string;
  accent: string;
}

type Rgb = [number, number, number];
type Lab = [number, number, number];
interface Cluster {
  rgb: Rgb;
  lab: Lab;
  share: number; // 0–1 of visible pixels
  s: number; // HSL saturation 0–1
  l: number; // HSL lightness 0–1
  chroma: number; // Lab chroma
}

const MAX_SIDE = 96;
const MAX_FILE_BYTES = 30 * 1024 * 1024;

// ── Colour maths ────────────────────────────────────────────────────────────────────────────────────────────
const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function rgbToLab([r, g, b]: Rgb): Lab {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const dist = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const relLum = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function contrast(a: Rgb, b: Rgb) {
  const la = relLum(a), lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const round = (c: Rgb): Rgb => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];

function makeCluster(rgb: Rgb, share: number): Cluster {
  const [, s, l] = rgbToHsl(rgb);
  const lab = rgbToLab(rgb);
  return { rgb, lab, share, s, l, chroma: Math.hypot(lab[1], lab[2]) };
}

// ── Pixel sampling + clustering ─────────────────────────────────────────────────────────────────────────────
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, "").replace(/[^A-Za-z0-9+/=]/g, "");
  const lookup = new Uint8Array(256).fill(255);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((clean.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)]!, b = lookup[clean.charCodeAt(i + 1)]!;
    const c = lookup[clean.charCodeAt(i + 2)] ?? 0, d = lookup[clean.charCodeAt(i + 3)] ?? 0;
    const n = (a << 18) | (b << 12) | ((c === 255 ? 0 : c) << 6) | (d === 255 ? 0 : d);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** Shrinks the picked image to ≤ MAX_SIDE px and returns RGBA pixels (same shape a canvas getImageData gives on web). */
async function loadPixels(file: Pick<LocalFile, "uri" | "type" | "size">): Promise<Uint8ClampedArray> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("not-an-image");
  if (file.size > MAX_FILE_BYTES) throw new Error("too-big");
  let b64: string | undefined;
  try {
    const ctx = ImageManipulator.ImageManipulator.manipulate(file.uri);
    const first = await ctx.renderAsync();
    const w0 = first.width, h0 = first.height;
    if (!w0 || !h0) throw new Error("decode-failed");
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const small = scale < 1 ? await ImageManipulator.ImageManipulator.manipulate(file.uri).resize({ width: Math.max(1, Math.round(w0 * scale)) }).renderAsync() : first;
    const saved = await small.saveAsync({ format: ImageManipulator.SaveFormat.PNG, base64: true });
    b64 = saved.base64;
  } catch {
    throw new Error("decode-failed");
  }
  if (!b64) throw new Error("decode-failed");
  let png;
  try {
    png = decode(base64ToBytes(b64));
  } catch {
    throw new Error("decode-failed");
  }
  const { width, height, channels, depth } = png;
  const src = png.data as ArrayLike<number>;
  if (!width || !height) throw new Error("decode-failed");
  const out = new Uint8ClampedArray(width * height * 4);
  const shift = depth === 16 ? 8 : 0; // 16-bit samples → top byte
  const px = (v: number) => (depth === 16 ? v >> shift : v);
  for (let i = 0, n = width * height; i < n; i++) {
    const o = i * 4, s = i * channels;
    if (channels >= 3) {
      out[o] = px(src[s]!); out[o + 1] = px(src[s + 1]!); out[o + 2] = px(src[s + 2]!);
      out[o + 3] = channels === 4 ? px(src[s + 3]!) : 255;
    } else {
      const g = px(src[s]!);
      out[o] = g; out[o + 1] = g; out[o + 2] = g;
      out[o + 3] = channels === 2 ? px(src[s + 1]!) : 255;
    }
  }
  return out;
}

function cluster(data: Uint8ClampedArray, k: number): Cluster[] {
  // 4-bit-per-channel histogram: sums let each bucket carry its true average colour.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key);
    if (e) {
      e.n++; e.r += r; e.g += g; e.b += b;
    } else buckets.set(key, { n: 1, r, g, b });
    total++;
  }
  if (!total) throw new Error("empty");
  const pts = [...buckets.values()].map((e) => {
    const rgb: Rgb = [e.r / e.n, e.g / e.n, e.b / e.n];
    return { rgb, lab: rgbToLab(rgb), w: e.n };
  });
  // Seed: heaviest bucket, then repeatedly the bucket farthest from every seed so far (spreads seeds across the colours).
  const seeds: Lab[] = [pts.reduce((a, b) => (b.w > a.w ? b : a)).lab];
  while (seeds.length < Math.min(k, pts.length)) {
    let best = pts[0], bestD = -1;
    for (const p of pts) {
      const d = Math.min(...seeds.map((s) => dist(p.lab, s)));
      const score = d * Math.sqrt(p.w);
      if (score > bestD) { bestD = score; best = p; }
    }
    seeds.push(best.lab);
  }
  let centers = seeds;
  let assign = new Array<number>(pts.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    assign = pts.map((p) => {
      let bi = 0, bd = Infinity;
      centers.forEach((c, i) => {
        const d = dist(p.lab, c);
        if (d < bd) { bd = d; bi = i; }
      });
      return bi;
    });
    const next = centers.map((c) => ({ w: 0, l: 0, a: 0, b: 0, c }));
    pts.forEach((p, i) => {
      const t = next[assign[i]];
      t.w += p.w; t.l += p.lab[0] * p.w; t.a += p.lab[1] * p.w; t.b += p.lab[2] * p.w;
    });
    centers = next.map((t) => (t.w ? ([t.l / t.w, t.a / t.w, t.b / t.w] as Lab) : t.c));
  }
  // Final colour of a cluster = weighted average of its members' RGB.
  const acc = centers.map(() => ({ w: 0, r: 0, g: 0, b: 0 }));
  pts.forEach((p, i) => {
    const t = acc[assign[i]];
    t.w += p.w; t.r += p.rgb[0] * p.w; t.g += p.rgb[1] * p.w; t.b += p.rgb[2] * p.w;
  });
  return acc.filter((t) => t.w > 0).map((t) => makeCluster(round([t.r / t.w, t.g / t.w, t.b / t.w]), t.w / total)).sort((a, b) => b.share - a.share);
}

// ── Assigning roles ─────────────────────────────────────────────────────────────────────────────────────────
/** Nudge lightness (keeping hue/saturation) until `rgb` has at least `min` contrast against `against`. */
function ensureContrast(rgb: Rgb, against: Rgb, min: number): Rgb {
  if (contrast(rgb, against) >= min) return rgb;
  const [h, s, l] = rgbToHsl(rgb);
  const goDarker = relLum(against) > 0.3;
  for (let step = 1; step <= 40; step++) {
    const nl = goDarker ? l - step * 0.02 : l + step * 0.02;
    const cand = round(hslToRgb(h, s, Math.min(0.97, Math.max(0.03, nl))));
    if (contrast(cand, against) >= min) return cand;
  }
  return goDarker ? [20, 18, 15] : [255, 255, 255];
}

const vividness = (c: Cluster) => c.chroma * Math.sqrt(c.share);

export function derivePalette(clusters: Cluster[]): ImagePalette {
  // Secondary: the biggest calm colour. If every big colour is loud, soften the dominant one into a light tint of itself.
  // "Calm" = low saturation, or so dark/light that saturation barely shows (navy, cream) — both make fine page backgrounds.
  const calm = clusters.filter((c) => (c.s <= 0.38 || c.l < 0.22 || c.l > 0.88) && c.share >= 0.06);
  let secondary: Rgb;
  if (calm.length) {
    secondary = calm[0].rgb;
  } else {
    const [h, s] = rgbToHsl(clusters[0].rgb);
    secondary = round(hslToRgb(h, Math.min(s, 0.45), 0.94));
  }
  const secLab = rgbToLab(secondary);

  // Primary: most vivid + prominent colour that stands apart from the background.
  const apart = clusters.filter((c) => dist(c.lab, secLab) > 18);
  const primaryPick = [...apart].sort((a, b) => vividness(b) - vividness(a))[0];
  let primaryRgb: Rgb;
  if (primaryPick && primaryPick.chroma > 12) {
    primaryRgb = primaryPick.rgb;
  } else if (primaryPick) {
    primaryRgb = primaryPick.rgb; // greyscale-ish image: the strongest contrasting neutral
  } else {
    primaryRgb = relLum(secondary) > 0.4 ? [26, 26, 26] : [245, 245, 245];
  }
  primaryRgb = ensureContrast(primaryRgb, secondary, 3);
  const primLab = rgbToLab(primaryRgb);
  const [pH, pS, pL] = rgbToHsl(primaryRgb);

  // Accent: next vivid colour clearly different from both, favouring a different hue.
  const hueGap = (h: number) => {
    const d = Math.abs(h - pH);
    return Math.min(d, 360 - d) / 180;
  };
  const accentPick = clusters
    .filter((c) => c.rgb !== primaryPick?.rgb && dist(c.lab, secLab) > 18 && dist(c.lab, primLab) > 22)
    .sort((a, b) => vividness(b) * (0.6 + hueGap(rgbToHsl(b.rgb)[0])) - vividness(a) * (0.6 + hueGap(rgbToHsl(a.rgb)[0])))[0];
  let accentRgb: Rgb;
  if (accentPick && accentPick.chroma > 12) {
    accentRgb = accentPick.rgb;
  } else {
    // Nothing else in the image: a related colour — hue turned ~35° from the primary, with a usable saturation.
    accentRgb = round(hslToRgb((pH + 35) % 360, Math.max(0.5, Math.min(0.8, pS || 0.6)), Math.min(0.55, Math.max(0.4, pL))));
  }
  accentRgb = ensureContrast(accentRgb, secondary, 2.2);

  return { primary: rgbToHex(...primaryRgb), secondary: rgbToHex(...secondary), accent: rgbToHex(...accentRgb) };
}

export type PaletteErrorCode = "not-an-image" | "too-big" | "decode-failed" | "empty";

/** RGBA pixel data → palette. Split out so the maths can be tested without a device. */
export function paletteFromPixels(data: Uint8ClampedArray): ImagePalette {
  return derivePalette(cluster(data, 8));
}

export async function paletteFromImage(file: Pick<LocalFile, "uri" | "type" | "size">): Promise<ImagePalette> {
  return paletteFromPixels(await loadPixels(file));
}

export function paletteErrorMessage(err: unknown): string {
  const m = err instanceof Error ? err.message : "";
  if (m === "too-big") return "That image is too large. Try one under 30 MB.";
  if (m === "not-an-image") return "Please choose an image file.";
  if (m === "empty") return "That image looks empty. Try a different one.";
  return "Couldn't read that image. Try a JPG, PNG or WebP.";
}
