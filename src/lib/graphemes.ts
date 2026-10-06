// src/lib/graphemes.ts
// Remove the last user-perceived character from a string. Hermes may not ship
// Intl.Segmenter, so this does it directly: if the text ends in an emoji
// sequence (flag, keycap, ZWJ family, skin-tone variant…) the whole sequence
// goes; otherwise the last code point (not UTF-16 unit, which would split a
// surrogate pair and leave a broken character behind).
const TRAILING_EMOJI = new RegExp(
  "(?:\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*)$",
  "u"
);

export function removeLastGrapheme(text: string): string {
  if (!text) return text;

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const Segmenter = (Intl as unknown as { Segmenter: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
    const parts = [...new Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
    parts.pop();
    return parts.join("");
  }

  const match = TRAILING_EMOJI.exec(text);
  if (match) return text.slice(0, match.index);

  const codePoints = Array.from(text);
  codePoints.pop();
  return codePoints.join("");
}
