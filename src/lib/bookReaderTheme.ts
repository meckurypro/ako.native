// src/lib/bookReaderTheme.ts
//
// Reader themes, typography and page-estimate helpers, shared (verbatim) by the
// web and native readers. Modelled on Apple Books' Themes & Settings sheet:
// Original, Quiet, Paper, Bold, Calm, Focus.

export type ReaderThemeId = "original" | "quiet" | "paper" | "bold" | "calm" | "focus";
export type ReaderFontId = "serif" | "sans" | "display";
export type LineSpacingId = "tight" | "normal" | "loose";

export interface ReaderThemeSpec {
  id: ReaderThemeId;
  label: string;
  bg: string;
  ink: string;
  muted: string;
  /** Hairlines, ornaments, scrubber track. */
  rule: string;
  /** Links, scrubber thumb, search highlight base. */
  accent: string;
  /** Translucent bar / sheet background. */
  chrome: string;
  /** Sheet / popover surface. */
  sheet: string;
  dark: boolean;
  /** Bold theme sets every weight a notch heavier. */
  heavy?: boolean;
  /** Focus theme defaults to a sans face and airier lines. */
  preferFont?: ReaderFontId;
}

export const READER_THEMES: Record<ReaderThemeId, ReaderThemeSpec> = {
  original: {
    id: "original", label: "Original",
    bg: "#FFFFFF", ink: "#1C1C1E", muted: "#8A8A8E", rule: "#D8D8DC", accent: "#2F6F4F",
    chrome: "rgba(255,255,255,0.92)", sheet: "#F2F2F4", dark: false,
  },
  quiet: {
    id: "quiet", label: "Quiet",
    bg: "#2C2C2F", ink: "#C9C9CE", muted: "#8E8E94", rule: "#48484D", accent: "#8FC4A4",
    chrome: "rgba(44,44,47,0.92)", sheet: "#3A3A3E", dark: true,
  },
  paper: {
    id: "paper", label: "Paper",
    bg: "#E9E7E2", ink: "#2A2926", muted: "#7B786F", rule: "#CCC9C0", accent: "#2F6F4F",
    chrome: "rgba(233,231,226,0.92)", sheet: "#DDDBD5", dark: false,
  },
  bold: {
    id: "bold", label: "Bold",
    bg: "#FFFFFF", ink: "#000000", muted: "#6B6B70", rule: "#CFCFD3", accent: "#1F5C3F",
    chrome: "rgba(255,255,255,0.94)", sheet: "#F2F2F4", dark: false, heavy: true,
  },
  calm: {
    id: "calm", label: "Calm",
    bg: "#F3E7CE", ink: "#3A2E1C", muted: "#8A7757", rule: "#DECFAE", accent: "#6B4F1D",
    chrome: "rgba(243,231,206,0.92)", sheet: "#E8D9B8", dark: false,
  },
  focus: {
    id: "focus", label: "Focus",
    bg: "#FBFAF2", ink: "#262520", muted: "#85826F", rule: "#E3E0CC", accent: "#3D5A45",
    chrome: "rgba(251,250,242,0.92)", sheet: "#EFEDDC", dark: false, preferFont: "sans",
  },
};

export const READER_THEME_ORDER: ReaderThemeId[] = ["original", "quiet", "paper", "bold", "calm", "focus"];

/** The theme a reader opens in: the app's own light/dark. In-reader picks are session-only (see useBookReaderTheme). */
export function defaultThemeFor(appIsDark: boolean): ReaderThemeId {
  return appIsDark ? "quiet" : "original";
}
export function coerceFont(value: string | null | undefined, theme: ReaderThemeId): ReaderFontId {
  if (value === "serif" || value === "sans" || value === "display") return value;
  return READER_THEMES[theme].preferFont ?? "serif";
}
export function coerceSpacing(value: string | null | undefined): LineSpacingId {
  return value === "tight" || value === "loose" ? value : "normal";
}

export const LINE_HEIGHT: Record<LineSpacingId, number> = { tight: 1.45, normal: 1.65, loose: 1.9 };

export const MIN_FONT_SIZE = 14;
export const MAX_FONT_SIZE = 30;
export const DEFAULT_FONT_SIZE = 18;
export const FONT_STEP = 2;

export function clampFontSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(n)));
}

// Typography choices persist; the THEME deliberately does not (it follows the app unless picked this session).
export const READER_STORAGE = {
  fontSize: "ako-reader-font-size",
  font: "ako-reader-font",
  spacing: "ako-reader-line-spacing",
  justify: "ako-reader-justify",
} as const;

// ---------------------------------------------------------------
// Page estimates. Text reflows continuously, so "page" means one
// screenful at the current type size, the same trick Apple Books
// uses for its "185 of 736" counter.
// ---------------------------------------------------------------

export interface PageMetrics {
  viewportW: number;
  viewportH: number;
  fontSize: number;
  lineHeight: number;
  /** Horizontal padding on each side of the text column. */
  padX: number;
  /** Width cap of the text column (readable measure on big screens). */
  maxColumn: number;
}

/** Estimated screenfuls for `chars` characters of body text. */
export function estimatePages(chars: number, m: PageMetrics): number {
  if (chars <= 0) return 1;
  const colW = Math.max(160, Math.min(m.viewportW - m.padX * 2, m.maxColumn));
  const charsPerLine = Math.max(12, Math.floor(colW / (m.fontSize * 0.5)));
  // Usable height: viewport minus top/bottom chrome and paragraph gaps.
  const lines = Math.max(6, Math.floor((m.viewportH * 0.8) / (m.fontSize * m.lineHeight)));
  // Paragraph breaks and headings eat ~12% extra vertical space.
  const perPage = charsPerLine * lines * 0.88;
  return Math.max(1, Math.ceil(chars / perPage));
}

export interface BookPosition {
  /** 1-based page across the whole book. */
  page: number;
  totalPages: number;
  /** 0..1 across the whole book. */
  overall: number;
  /** Whole pages left before the next chapter starts. */
  pagesLeftInChapter: number;
}

/**
 * Where the reader is in the whole book. `chapterPages` are the per-chapter
 * estimates (the open chapter may be replaced by its measured page count);
 * `fraction` is the scroll fraction inside chapter `index`.
 */
export function locate(chapterPages: number[], index: number, fraction: number): BookPosition {
  const total = Math.max(1, chapterPages.reduce((a, b) => a + b, 0));
  let before = 0;
  for (let i = 0; i < index; i++) before += chapterPages[i] ?? 0;
  const here = Math.max(1, chapterPages[index] ?? 1);
  const f = Math.min(1, Math.max(0, fraction));
  const intoChapter = Math.min(here, Math.floor(f * here) + 1);
  const page = Math.min(total, before + intoChapter);
  return {
    page,
    totalPages: total,
    overall: Math.min(1, (before + f * here) / total),
    pagesLeftInChapter: Math.max(0, here - intoChapter),
  };
}

/** Inverse of locate's `overall`: which chapter + fraction a 0..1 book position lands on. */
export function resolveOverall(chapterPages: number[], overall: number): { index: number; fraction: number } {
  const total = Math.max(1, chapterPages.reduce((a, b) => a + b, 0));
  let target = Math.min(1, Math.max(0, overall)) * total;
  for (let i = 0; i < chapterPages.length; i++) {
    const p = Math.max(1, chapterPages[i]);
    if (target <= p || i === chapterPages.length - 1) {
      return { index: i, fraction: Math.min(1, Math.max(0, target / p)) };
    }
    target -= p;
  }
  return { index: 0, fraction: 0 };
}

/**
 * Where to draw the thin page dividers inside a chapter. Pages are screenfuls, so the ideal
 * break for page k is k/pages of the way down the content. `edges` are the gaps between
 * blocks (paragraphs, headings, lists), measured from the top of the content; each ideal
 * break snaps to the nearest gap so a line never strikes through a line of text.
 */
export function pageBreakOffsets(edges: number[], contentH: number, pages: number): number[] {
  // Layout can briefly report 0 or non-finite sizes (a chapter swap); a page count from those is meaningless.
  if (!Number.isFinite(pages) || !Number.isFinite(contentH) || pages < 2 || pages > 2000 || contentH <= 0 || edges.length === 0) return [];
  const sorted = edges.filter((e) => Number.isFinite(e) && e > 0 && e < contentH).sort((a, b) => a - b);
  const pageH = contentH / pages;
  const out: number[] = [];
  for (let k = 1; k < pages; k++) {
    const target = k * pageH;
    let best = -1;
    let bestD = Infinity;
    for (const e of sorted) {
      const d = Math.abs(e - target);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    // A gap more than half a page away would misplace the break: skip that one.
    if (best < 0 || bestD > pageH / 2) continue;
    if (out.length === 0 || best - out[out.length - 1] > pageH / 4) out.push(best);
  }
  return out;
}

export function pagesLeftLabel(n: number): string {
  if (n <= 0) return "Last page of chapter";
  if (n === 1) return "1 page left in chapter";
  return `${n} pages left in chapter`;
}

export function relativeDay(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const days = Math.floor((startOfDay(now) - startOfDay(d.getTime())) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: days > 300 ? "numeric" : undefined });
}
function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
