// src/lib/bookEditorOps.ts
// Pure text edits behind the book editor's formatting toolbar. Each one takes the chapter text and the
// current selection and returns the new text and selection, so the web <textarea> and the native
// <TextInput> share it. Output is the Markdown that lib/bookFormat.ts parses and the reader renders.
// KEEP IDENTICAL in ako (web) and ako.native — change both together.

export type BookFormatOp =
  | "h1"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "code"
  | "link"
  | "bullet"
  | "numbered"
  | "quote"
  | "codeblock"
  | "divider";

export interface EditResult {
  text: string;
  start: number;
  end: number;
}

const INLINE: Partial<Record<BookFormatOp, string>> = { bold: "**", italic: "*", code: "`" };
const LINE_PREFIX: Partial<Record<BookFormatOp, string>> = { h1: "# ", h2: "## ", h3: "### ", bullet: "- ", quote: "> " };
const ANY_PREFIX = /^(#{1,6}\s+|[-*+•]\s+|\d{1,3}[.)]\s+|>\s?)/;

function wrap(text: string, s: number, e: number, mark: string): EditResult {
  const sel = text.slice(s, e);
  // Already wrapped just outside the selection: unwrap.
  if (s >= mark.length && text.slice(s - mark.length, s) === mark && text.slice(e, e + mark.length) === mark) {
    return {
      text: text.slice(0, s - mark.length) + sel + text.slice(e + mark.length),
      start: s - mark.length,
      end: e - mark.length,
    };
  }
  // Selection includes the markers themselves: unwrap.
  if (sel.length >= mark.length * 2 + 1 && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(mark.length, sel.length - mark.length);
    return { text: text.slice(0, s) + inner + text.slice(e), start: s, end: s + inner.length };
  }
  const out = text.slice(0, s) + mark + sel + mark + text.slice(e);
  return sel ? { text: out, start: s + mark.length, end: e + mark.length } : { text: out, start: s + mark.length, end: s + mark.length };
}

function link(text: string, s: number, e: number): EditResult {
  const sel = text.slice(s, e);
  const label = sel || "link text";
  const url = "https://";
  const out = text.slice(0, s) + `[${label}](${url})` + text.slice(e);
  if (sel) {
    // Leave the address selected so it can be typed over.
    const urlStart = s + label.length + 3;
    return { text: out, start: urlStart, end: urlStart + url.length };
  }
  return { text: out, start: s + 1, end: s + 1 + label.length };
}

function linePrefix(text: string, s: number, e: number, op: BookFormatOp): EditResult {
  const from = text.lastIndexOf("\n", s - 1) + 1;
  let to = text.indexOf("\n", e > s ? e - 1 : e);
  if (to === -1) to = text.length;
  const lines = text.slice(from, to).split("\n");
  const want = op === "numbered" ? null : LINE_PREFIX[op]!;
  const has = (l: string, i: number) => (op === "numbered" ? new RegExp(`^${i + 1}[.)]\\s`).test(l) : l.startsWith(want!));
  const nonEmpty = lines.map((l, i) => ({ l, i })).filter((x) => x.l.trim());
  const allHave = nonEmpty.length > 0 && nonEmpty.every((x) => has(x.l, x.i));
  const next = lines.map((l, i) => {
    if (!l.trim()) return l;
    const bare = l.replace(ANY_PREFIX, "");
    if (allHave) return bare;
    return (op === "numbered" ? `${i + 1}. ` : want!) + bare;
  });
  const joined = next.join("\n");
  const out = text.slice(0, from) + joined + text.slice(to);
  return { text: out, start: from, end: from + joined.length };
}

function codeBlock(text: string, s: number, e: number): EditResult {
  const sel = text.slice(s, e);
  const before = text.slice(0, s);
  const after = text.slice(e);
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after === "" || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const open = lead + "```\n";
  const out = before + open + sel + "\n```" + trail + after;
  const cursor = before.length + open.length;
  return { text: out, start: cursor, end: cursor + sel.length };
}

function divider(text: string, s: number, e: number): EditResult {
  const before = text.slice(0, s);
  const after = text.slice(e);
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after === "" || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const ins = lead + "---" + trail;
  const out = before + ins + after;
  const cursor = before.length + ins.length;
  return { text: out, start: cursor, end: cursor };
}

export function applyBookFormat(text: string, selStart: number, selEnd: number, op: BookFormatOp): EditResult {
  const s = Math.max(0, Math.min(selStart, text.length));
  const e = Math.max(s, Math.min(selEnd, text.length));
  const mark = INLINE[op];
  if (mark) return wrap(text, s, e, mark);
  switch (op) {
    case "link":
      return link(text, s, e);
    case "codeblock":
      return codeBlock(text, s, e);
    case "divider":
      return divider(text, s, e);
    default:
      return linePrefix(text, s, e, op);
  }
}
