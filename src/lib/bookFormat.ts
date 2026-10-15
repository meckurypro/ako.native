// src/lib/bookFormat.ts
// Pure (no React, no platform APIs) parser that turns an authored book chapter's
// text into display blocks. Chapters are written as plain Markdown:
//   # / ## / ###  headings        **bold**   *italic*   `code`
//   - / * / • bullets, 1. numbered (indent = nesting)    > quote    --- divider
// Blank lines separate paragraphs; single line breaks inside a paragraph are kept.
//
// Deliberately NOT lessonFormat.ts: that parser is tuned for course lessons
// (emoji sections, auto-bolded ALL-CAPS words, "Term: definition" lists) and would
// mangle book prose.
//
// Hermes-safe: no regex lookbehind and no \p{…} escapes.
// KEEP IDENTICAL in ako (web) and ako.native — change both together.

export type BookInline =
  | { t: "text"; v: string }
  | { t: "bold"; c: BookInline[] }
  | { t: "italic"; c: BookInline[] }
  | { t: "code"; v: string };

export interface BookListItem {
  marker: string;
  depth: number;
  inline: BookInline[];
}

export type BookBlock =
  | { k: "heading"; level: 1 | 2 | 3; inline: BookInline[] }
  | { k: "p"; inline: BookInline[] }
  | { k: "list"; items: BookListItem[] }
  | { k: "quote"; inline: BookInline[] }
  | { k: "code"; text: string }
  | { k: "hr" };

const WORD_CHAR = /[A-Za-z0-9\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;
const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isWord = (ch: string | undefined) => ch !== undefined && WORD_CHAR.test(ch);

// Longest marker first so "***x***" is bold+italic rather than a stray "*" + bold.
const MARKERS = ["***", "**", "*"] as const;

/** Index of the closing `marker` for an opener whose content starts at `from`, or -1. */
function findClose(text: string, from: number, marker: string): number {
  for (let j = from; j < text.length; j++) {
    const ch = text[j];
    if (ch === "\\") {
      j++; // skip the escaped character
      continue;
    }
    if (marker === "*" && text.startsWith("**", j)) {
      j++; // a nested **bold** inside *italic* — skip the pair
      continue;
    }
    if (!text.startsWith(marker, j)) continue;
    // Closer must hug the text (no space before it) and not sit inside a word.
    if (j > from && !isSpace(text[j - 1]) && !isWord(text[j + marker.length])) return j;
  }
  return -1;
}

export function parseBookInline(text: string): BookInline[] {
  const out: BookInline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push({ t: "text", v: buf });
      buf = "";
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // Backslash escapes: \* \` \\
    if (ch === "\\" && i + 1 < text.length && "\\*`".includes(text[i + 1])) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1 && text.slice(i + 1, end).indexOf("\n") === -1) {
        flush();
        out.push({ t: "code", v: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "*") {
      let matched = false;
      // Opener must not sit inside a word (so 3*4 and snake*case stay literal).
      if (!isWord(text[i - 1])) {
        for (const m of MARKERS) {
          if (!text.startsWith(m, i)) continue;
          const next = text[i + m.length];
          if (isSpace(next) || next === "*") continue; // "* item", "** " or "****"
          const close = findClose(text, i + m.length, m);
          if (close === -1) continue;
          const inner = parseBookInline(text.slice(i + m.length, close));
          flush();
          if (m === "***") out.push({ t: "bold", c: [{ t: "italic", c: inner }] });
          else if (m === "**") out.push({ t: "bold", c: inner });
          else out.push({ t: "italic", c: inner });
          i = close + m.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      // Unmatched marker → literal text (consume the whole run so we don't re-try inside it).
      let run = 1;
      while (text[i + run] === "*") run++;
      buf += text.slice(i, i + run);
      i += run;
      continue;
    }

    buf += ch;
    i++;
  }
  flush();
  return out;
}

const LIST_RE = /^(\s*)([-*+•▸▪◦●]|\d{1,3}[.)])\s+(\S.*)$/;
const HR_RE = /^([-*_])(\s*\1){2,}$/;
const HEADING_RE = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/;

function isBlockStart(trimmed: string, raw: string): boolean {
  return (
    /^```/.test(trimmed) ||
    HR_RE.test(trimmed) ||
    HEADING_RE.test(trimmed) ||
    /^>/.test(trimmed) ||
    LIST_RE.test(raw)
  );
}

export function parseBook(src: string | null | undefined): BookBlock[] {
  const lines = (src ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const blocks: BookBlock[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ k: "p", inline: parseBookInline(para.join("\n")) });
      para = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Fenced code block
    if (/^```/.test(trimmed)) {
      flushPara();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      i++; // closing fence (or end of text)
      blocks.push({ k: "code", text: code.join("\n") });
      continue;
    }

    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }

    if (HR_RE.test(trimmed)) {
      flushPara();
      blocks.push({ k: "hr" });
      i++;
      continue;
    }

    const h = HEADING_RE.exec(trimmed);
    if (h) {
      flushPara();
      blocks.push({ k: "heading", level: Math.min(3, h[1].length) as 1 | 2 | 3, inline: parseBookInline(h[2]) });
      i++;
      continue;
    }

    if (/^>/.test(trimmed)) {
      flushPara();
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        q.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ k: "quote", inline: parseBookInline(q.join("\n")) });
      continue;
    }

    if (LIST_RE.test(raw)) {
      flushPara();
      const rows: { indent: number; marker: string; text: string }[] = [];
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i]);
        if (m) {
          const glyph = m[2];
          rows.push({
            indent: m[1].length,
            marker: /^\d/.test(glyph) ? glyph : /^[-*+]$/.test(glyph) ? "•" : glyph,
            text: m[3],
          });
          i++;
          continue;
        }
        // An indented follow-on line belongs to the previous item.
        const t = lines[i];
        if (rows.length && t.trim() && /^\s{2,}\S/.test(t) && !isBlockStart(t.trim(), t)) {
          rows[rows.length - 1].text += "\n" + t.trim();
          i++;
          continue;
        }
        break;
      }
      const base = Math.min(...rows.map((r) => r.indent));
      blocks.push({
        k: "list",
        items: rows.map((r) => ({
          marker: r.marker,
          depth: Math.min(3, Math.floor((r.indent - base) / 3)),
          inline: parseBookInline(r.text),
        })),
      });
      continue;
    }

    para.push(trimmed);
    i++;
  }
  flushPara();
  return blocks;
}
