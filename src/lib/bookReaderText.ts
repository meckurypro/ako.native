// src/lib/bookReaderText.ts
//
// Text helpers for the book reader's chrome: chapter-opener split, plain text for
// search / bookmark snippets, reading time. Built on lib/bookFormat.ts (the one
// Markdown parser both apps share), so nothing here parses Markdown itself.
//
// Pure (no React, no platform APIs), Hermes-safe (no lookbehind, no \p{…}).
// KEEP IDENTICAL in ako (web) and ako.native — change both together.
import { parseBook, type BookBlock, type BookInline } from "./bookFormat";

export function inlineToPlain(nodes: BookInline[]): string {
  let out = "";
  for (const n of nodes) out += n.t === "text" || n.t === "code" ? n.v : inlineToPlain(n.c);
  return out;
}

export function blockToPlain(b: BookBlock): string {
  switch (b.k) {
    case "heading":
    case "p":
    case "quote":
      return inlineToPlain(b.inline);
    case "list":
      return b.items.map((it) => inlineToPlain(it.inline)).join("\n");
    case "code":
      return b.text;
    case "hr":
      return "";
  }
}

// ---------------------------------------------------------------
// Chapter opener. Authors usually start a chapter with
// "# Chapter One: AI Is Not a Skill". The reader shows that as a small
// "Chapter One" label over a large title, and drops the duplicate from the body.
// ---------------------------------------------------------------

export interface ChapterOpener {
  eyebrow: string | null;
  title: string;
  body: BookBlock[];
}

const CHAPTER_LABEL = /^((?:chapter|part|book|section)\s+[\w-]+)\s*[:.\u2013-]\s*(.+)$/i;
const LABEL_ONLY = /^(?:chapter|part|book|section)\s+[\w-]+$/i;

export function splitChapterOpener(blocks: BookBlock[], fallbackTitle: string, fallbackEyebrow: string | null): ChapterOpener {
  const first = blocks[0];
  if (first && first.k === "heading" && first.level === 1) {
    const text = inlineToPlain(first.inline).trim();
    const body = blocks.slice(1);
    const m = CHAPTER_LABEL.exec(text);
    if (m) return { eyebrow: m[1], title: m[2], body };
    if (LABEL_ONLY.test(text)) return { eyebrow: text, title: fallbackTitle, body };
    return { eyebrow: fallbackEyebrow, title: text, body };
  }
  return { eyebrow: fallbackEyebrow, title: fallbackTitle, body: blocks };
}

// ---------------------------------------------------------------
// Plain text of a chapter (what search and bookmark snippets see)
// ---------------------------------------------------------------

const plainCache = new Map<string, string>();
export function chapterPlainText(markdown: string | null | undefined): string {
  if (!markdown) return "";
  const hit = plainCache.get(markdown);
  if (hit !== undefined) return hit;
  const text = parseBook(markdown).map(blockToPlain).filter(Boolean).join("\n\n");
  if (plainCache.size > 64) plainCache.clear();
  plainCache.set(markdown, text);
  return text;
}

/** ~230 words a minute. */
export function readingMinutes(text: string): number {
  const t = text.trim();
  const words = t ? t.split(/\s+/).length : 0;
  return Math.max(1, Math.round(words / 230));
}

/** A short excerpt of `text` at `fraction` (0..1), for bookmark labels. */
export function snippetAt(text: string, fraction: number, length = 90): string {
  if (!text) return "";
  const at = Math.floor(Math.min(0.98, Math.max(0, fraction)) * text.length);
  let start = at;
  while (start > 0 && !/\s/.test(text[start - 1]) && at - start < 24) start -= 1;
  const slice = text.slice(start, start + length).replace(/\s+/g, " ").trim();
  return slice.length >= length ? slice.replace(/\s+\S*$/, "") + "…" : slice;
}

export interface SearchHit {
  chapterId: string;
  /** Position of the match in the chapter's plain text, as 0..1. */
  fraction: number;
  before: string;
  match: string;
  after: string;
}

/** Case-insensitive search across chapters, capped so a two-letter query stays cheap. */
export function searchChapters(chapters: { id: string; content: string | null }[], query: string, limit = 60): SearchHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const needle = q.toLowerCase();
  const hits: SearchHit[] = [];
  for (const c of chapters) {
    const text = chapterPlainText(c.content);
    if (!text) continue;
    const hay = text.toLowerCase();
    // lower-casing can change length for a few exotic characters; skip those chapters rather than mis-slice.
    if (hay.length !== text.length) continue;
    let from = 0;
    while (hits.length < limit) {
      const idx = hay.indexOf(needle, from);
      if (idx === -1) break;
      const bStart = Math.max(0, idx - 36);
      const aEnd = Math.min(text.length, idx + needle.length + 56);
      hits.push({
        chapterId: c.id,
        fraction: idx / text.length,
        before: (bStart > 0 ? "…" : "") + text.slice(bStart, idx).replace(/\s+/g, " "),
        match: text.slice(idx, idx + needle.length),
        after: text.slice(idx + needle.length, aEnd).replace(/\s+/g, " ") + (aEnd < text.length ? "…" : ""),
      });
      from = idx + needle.length;
    }
    if (hits.length >= limit) break;
  }
  return hits;
}
