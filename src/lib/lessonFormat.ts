// src/lib/lessonFormat.ts
// Pure (no React, no platform APIs) parser that turns a course lesson's text into display blocks.
// Understands Ako's "emoji section" convention ("🎯 GOAL", "🪜 STEPS", "🔧 WHEN IT BREAKS" …) and a
// small Markdown subset (#, -, 1., >, ``` fences, **bold**, `code`), so owners can type either.
// KEEP IDENTICAL in ako (web) and ako.native — change both together.
import { lessonMinutes } from "./courseTypes";

export type Tone = "goal" | "success" | "warn" | "danger" | "tip" | "plain";

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; v: string }
  | { t: "code"; v: string }
  | { t: "link"; v: string; href: string };

export type ListMarker =
  | { kind: "dot" }
  | { kind: "num"; n: string }
  | { kind: "letter"; v: string }
  | { kind: "emoji"; v: string }
  | { kind: "check" };

export interface ListItem {
  marker: ListMarker;
  inline: Inline[];
  extra: Block[];
}

export type Block =
  | { k: "section"; tone: Tone; emoji: string; title: string; blocks: Block[] }
  | { k: "heading"; level: 1 | 2 | 3; inline: Inline[] }
  | { k: "p"; inline: Inline[] }
  | { k: "list"; items: ListItem[] }
  | { k: "code"; text: string }
  | { k: "note"; inline: Inline[] }
  | { k: "hr" };

export interface ParsedLesson {
  /** Emoji from the lesson's banner line, used as the lesson's icon. */
  emoji: string | null;
  blocks: Block[];
}

// Emoji detection without \p{…} escapes (Hermes support for them is not guaranteed).
const EMOJI =
  "(?:[\\uD83C-\\uD83E][\\uDC00-\\uDFFF]|[\\u2600-\\u27BF\\u2B00-\\u2BFF\\u2300-\\u23FF\\u25FB-\\u25FE\\u2934\\u2935\\u3030\\u303D\\u3297\\u3299\\u00A9\\u00AE\\u203C\\u2049\\u2122\\u2139\\u24C2])[\\uFE0F\\uFE0E]?";
const KEYCAP = "[0-9#*]\\uFE0F?\\u20E3";
const LEAD = new RegExp("^(" + KEYCAP + "|" + EMOJI + ")\\s*");
const DOT_GLYPH = /^([▸▪◦•·●○‣▹►])\s+/;
const DASH_BULLET = /^([-*+])\s+/;
const CHECK_GLYPH = /^(☐|☑|✔|✓)\s+/;
const DIVIDER = /^[━─═_-]{4,}$/;

function leadingSpaces(raw: string): number {
  let n = 0;
  while (n < raw.length && raw[n] === " ") n++;
  return n;
}

function splitEmoji(line: string): { emoji: string; rest: string } | null {
  const m = LEAD.exec(line);
  if (!m) return null;
  return { emoji: m[1], rest: line.slice(m[0].length) };
}

/** "🎯 GOAL" style header: emoji + a mostly-uppercase phrase (before any "(" or ":"). */
function headerOf(line: string): { emoji: string; title: string } | null {
  const sp = splitEmoji(line);
  if (!sp) return null;
  const title = sp.rest.trim();
  if (title.length < 2 || title.length > 70) return null;
  if (/^[0-9#*]\uFE0F?\u20E3/.test(line)) return null;
  const head = title.split(/[(:]/)[0];
  const letters = head.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return null;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  if (upper / letters.length < 0.8) return null;
  return { emoji: sp.emoji, title };
}

function toneFor(emoji: string, title: string): Tone {
  const t = title.toUpperCase();
  if (/BREAK|SYMPTOM|FAIL|TROUBLE|NEVER|DON'T|LEAK/.test(t)) return "danger";
  if (/CAREFUL|WARNING|HONESTY|TRADE-?OFF|UNDOING|KNOW THE DIFFERENCE/.test(t)) return "warn";
  if (/CHECKPOINT|YOU DID IT|CAPSTONE/.test(t)) return "success";
  if (/\bGOAL\b/.test(t)) return "goal";
  if (/\bWHY\b|KEY FACT|THE IDEA|THREE IDEAS|RULE OF THUMB|TRUE STORY|MENTAL|TIP\b/.test(t)) return "tip";
  if (emoji === "🎯") return "goal";
  if (emoji === "✅" || emoji === "🎉" || emoji === "🏆") return "success";
  if (emoji === "⚠️" || emoji === "⚠" || emoji === "🟡") return "warn";
  if (emoji === "🔴" || emoji === "🚨" || emoji === "🔧") return "danger";
  if (emoji === "💡" || emoji === "🧠") return "tip";
  return "plain";
}

const INLINE_RE = new RegExp(
  [
    "`([^`]+)`", // 1 code
    "\\*\\*([^*]+)\\*\\*", // 2 bold
    "(https?:\\/\\/[^\\s)]*[^\\s).,;:!?])", // 3 url
    "\\b((?:expo\\.dev|github\\.com)(?:\\/[^\\s)]*[^\\s).,;:!?])?)", // 4 bare domain
    "\\b([A-Za-z0-9_.-]+\\.(?:json|ya?ml|tsx?|jsx?|md|apk|aab|env|xml|toml|lock|png|wav))\\b", // 5 file
    "\\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+_?\\*?)", // 6 ENV_VAR
  ].join("|"),
  "g"
);

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "bold", v: m[2] });
    else if (m[3] !== undefined) out.push({ t: "link", v: m[3], href: m[3] });
    else if (m[4] !== undefined) out.push({ t: "link", v: m[4], href: "https://" + m[4] });
    else if (m[5] !== undefined || m[6] !== undefined) out.push({ t: "code", v: (m[5] ?? m[6]) as string });
    last = m.index + m[0].length;
    if (m[0].length === 0) INLINE_RE.lastIndex++;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

function boldFirst(inline: Inline[], n: number): Inline[] {
  // Bold the first `n` characters of a leading text run (used for "TERM: definition" and "SYMPTOM → fix").
  const first = inline[0];
  if (!first || first.t !== "text" || n <= 0 || n > first.v.length) return inline;
  const rest: Inline[] = [];
  rest.push({ t: "bold", v: first.v.slice(0, n) });
  if (first.v.length > n) rest.push({ t: "text", v: first.v.slice(n) });
  return [...rest, ...inline.slice(1)];
}

function itemInline(text: string, marker: ListMarker, sectionTitle: string): Inline[] {
  let inline = parseInline(text);
  // "CHANNEL: the pipe…", "REVOKE it right away…" → bold the leading ALL-CAPS words.
  const caps = /^([A-Z][A-Z-]{2,}(?: [A-Z][A-Z-]{2,})*)(?=[\s:]|$)/.exec(text);
  if (caps) return boldFirst(inline, caps[1].length);
  // Glossary style "▸ Term (abbr): definition".
  if (marker.kind === "dot") {
    const g = /^([^:]{2,40}):\s+\S/.exec(text);
    if (g && g[1].split(/\s+/).length <= 5) return boldFirst(inline, g[1].length);
  }
  // "WHEN IT BREAKS" rows read "symptom → fix": bold the symptom.
  if (/BREAK|SYMPTOM/i.test(sectionTitle)) {
    const arrow = text.indexOf(" → ");
    if (arrow > 0) return boldFirst(inline, arrow);
  }
  return inline;
}

function parseItemLine(
  trimmed: string
): { marker: ListMarker; text: string } | null {
  let m = CHECK_GLYPH.exec(trimmed);
  if (m) return { marker: { kind: "check" }, text: trimmed.slice(m[0].length) };
  m = DOT_GLYPH.exec(trimmed);
  if (m) return { marker: { kind: "dot" }, text: trimmed.slice(m[0].length) };
  m = /^(\d{1,2})[.)]\s+(.*)$/.exec(trimmed);
  if (m) return { marker: { kind: "num", n: m[1] }, text: m[2] };
  const kc = new RegExp("^([0-9])\\uFE0F?\\u20E3\\s*(.*)$").exec(trimmed);
  if (kc) return { marker: { kind: "num", n: kc[1] }, text: kc[2] };
  m = /^([a-z])\)\s+(.*)$/.exec(trimmed);
  if (m) return { marker: { kind: "letter", v: m[1] }, text: m[2] };
  const sp = splitEmoji(trimmed);
  if (sp && sp.rest.trim()) return { marker: { kind: "emoji", v: sp.emoji }, text: sp.rest.trim() };
  m = DASH_BULLET.exec(trimmed);
  if (m) return { marker: { kind: "dot" }, text: trimmed.slice(m[0].length) };
  return null;
}

function stripIndent(lines: string[]): string {
  const nonEmpty = lines.filter((l) => l.trim());
  const min = nonEmpty.length ? Math.min(...nonEmpty.map(leadingSpaces)) : 0;
  return lines.map((l) => l.slice(Math.min(min, leadingSpaces(l)))).join("\n").replace(/\s+$/, "");
}

export function parseLesson(src: string | null | undefined): ParsedLesson {
  const lines = (src ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const out: Block[] = [];
  let section: Extract<Block, { k: "section" }> | null = null;
  let curList: Extract<Block, { k: "list" }> | null = null;
  let lastItem: ListItem | null = null;
  let para: string[] = [];
  let paraTarget: "block" | "item" = "block";
  let bannerEmoji: string | null = null;

  const target = (): Block[] => (section ? section.blocks : out);
  const flushPara = () => {
    if (para.length === 0) return;
    const block: Block = { k: "p", inline: parseInline(para.join("\n")) };
    if (paraTarget === "item" && lastItem) lastItem.extra.push(block);
    else target().push(block);
    para = [];
  };
  const closeList = () => {
    flushPara();
    curList = null;
    lastItem = null;
  };

  // Banner: first non-empty line is a header followed by a divider line.
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length) {
    const h = headerOf(lines[i].trim());
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (h && j < lines.length && DIVIDER.test(lines[j].trim())) {
      bannerEmoji = h.emoji;
      i = j + 1;
    }
  }

  let blank = 0;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const indent = leadingSpaces(raw);

    if (!trimmed) {
      blank++;
      continue;
    }
    const hadBlank = blank > 0;
    blank = 0;

    // Fenced code ```…```
    if (trimmed.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      flushPara();
      const code: Block = { k: "code", text: stripIndent(buf) };
      if (curList && lastItem) lastItem.extra.push(code);
      else target().push(code);
      continue;
    }

    // Divider
    if (DIVIDER.test(trimmed)) {
      closeList();
      target().push({ k: "hr" });
      continue;
    }

    // Markdown headings
    const md = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (md && indent < 2) {
      closeList();
      target().push({ k: "heading", level: md[1].length as 1 | 2 | 3, inline: parseInline(md[2]) });
      continue;
    }

    // Section header ("🎯 GOAL")
    if (indent < 2) {
      const h = headerOf(trimmed);
      if (h) {
        closeList();
        section = { k: "section", tone: toneFor(h.emoji, h.title), emoji: h.emoji, title: h.title, blocks: [] };
        out.push(section);
        continue;
      }
    }

    // Quote / note
    if (trimmed.startsWith("> ")) {
      closeList();
      target().push({ k: "note", inline: parseInline(trimmed.slice(2)) });
      continue;
    }

    // Code (indent ≥ 6): collect the run, allowing blank lines inside it.
    const itemGlyphFirst = indent >= 6 && (DOT_GLYPH.test(trimmed) || CHECK_GLYPH.test(trimmed) || !!splitEmoji(trimmed));
    if (indent >= 6 && !itemGlyphFirst) {
      const buf: string[] = [raw];
      while (i + 1 < lines.length) {
        const nx = lines[i + 1];
        if (nx.trim() && leadingSpaces(nx) >= 6) {
          buf.push(nx);
          i++;
        } else if (!nx.trim()) {
          // keep a single blank line only if code resumes after it
          let k = i + 2;
          while (k < lines.length && !lines[k].trim()) k++;
          if (k < lines.length && leadingSpaces(lines[k]) >= 6) {
            for (let b = i + 1; b < k; b++) buf.push("");
            i = k - 1;
          } else break;
        } else break;
      }
      flushPara();
      const code: Block = { k: "code", text: stripIndent(buf) };
      if (curList && lastItem) lastItem.extra.push(code);
      else target().push(code);
      continue;
    }

    // List items
    const item = parseItemLine(trimmed);
    if (item) {
      flushPara();
      const li: ListItem = {
        marker: item.marker,
        inline: itemInline(item.text, item.marker, section?.title ?? ""),
        extra: [],
      };
      if (!curList) {
        curList = { k: "list", items: [] };
        target().push(curList);
      }
      curList.items.push(li);
      lastItem = li;
      continue;
    }

    // Continuation of the last list item (indented text, no blank line between)
    if (curList && lastItem && indent >= 2 && !hadBlank) {
      paraTarget = "item";
      para.push(trimmed);
      // flush when next line is not another continuation
      const nx = lines[i + 1];
      if (nx === undefined || !nx.trim() || leadingSpaces(nx) < 2 || leadingSpaces(nx) >= 6 || !!parseItemLine(nx.trim())) flushPara();
      paraTarget = "block";
      continue;
    }

    // Plain paragraph (consecutive lines stay together, line breaks preserved)
    if (curList) closeList();
    paraTarget = "block";
    para.push(trimmed);
    const nx = lines[i + 1];
    if (nx === undefined || !nx.trim() || headerOf(nx.trim()) || parseItemLine(nx.trim()) || leadingSpaces(nx) >= 6) flushPara();
  }
  closeList();

  return { emoji: bannerEmoji, blocks: out };
}

/** Rough reading time in whole minutes (min 1) for a lesson's text. */
export function readMinutes(src: string | null | undefined): number {
  const words = (src ?? "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

export interface ReaderLesson {
  id: string;
  module_id: string;
  content: string | null;
  media_url: string | null;
  lesson_type?: string | null;
  video_path?: string | null;
  video_duration?: number | null;
  data?: unknown;
}
export interface ReaderModule<L extends ReaderLesson = ReaderLesson> {
  id: string;
  lessons: L[];
}

export interface ModuleProgress {
  done: number;
  total: number;
  complete: boolean;
}

/** Progress numbers the course reader needs, derived from modules + the completed-lesson id set. */
export function buildReaderModel<L extends ReaderLesson>(modules: ReaderModule<L>[], completed: Set<string>) {
  const flat = modules.flatMap((m) => m.lessons);
  const total = flat.length;
  const done = flat.filter((l) => completed.has(l.id)).length;
  const next = flat.find((l) => !completed.has(l.id)) ?? null;
  const minutesLeft = flat.filter((l) => !completed.has(l.id)).reduce((s, l) => s + lessonMinutes(l), 0);
  const perModule = new Map<string, ModuleProgress>();
  for (const m of modules) {
    const d = m.lessons.filter((l) => completed.has(l.id)).length;
    perModule.set(m.id, { done: d, total: m.lessons.length, complete: m.lessons.length > 0 && d === m.lessons.length });
  }
  return {
    flat,
    total,
    done,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
    next,
    minutesLeft,
    perModule,
    allDone: total > 0 && done === total,
  };
}
