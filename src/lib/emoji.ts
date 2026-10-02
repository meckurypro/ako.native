// src/lib/emoji.ts
//
// Detects "emoji-only" messages so the thread can render them the way
// WhatsApp (and iMessage) do: a standalone message of 1-3 emoji, with
// no other text, gets shown large with no chat bubble behind it; 4+
// emoji-only characters, or any mix of emoji and text, fall back to
// the normal bubble at normal size. Confirmed behavior (not guessed —
// see the research trail in the PR this shipped with): both apps cap
// the "jumbo" treatment at 3 characters and step the size down as the
// count goes from 1 to 3, reverting to plain text styling at 4+.

/**
 * Matches one emoji "character" as a user actually perceives it: a
 * base pictographic/emoji code point, optionally followed by a
 * variation selector, skin-tone modifier, or a chain of zero-width-
 * joined pictographs (for family/profession/multi-part emoji), OR a
 * flag built from two regional-indicator letters, OR a keycap sequence
 * (digit/`#`/`*` + U+FE0F + U+20E3).
 */
const EMOJI_TOKEN = new RegExp(
  "(?:\\p{Regional_Indicator}{2})" + // flags, e.g. 🇳🇬
    "|(?:[0-9#*]\\uFE0F?\\u20E3)" + // keycaps, e.g. 5️⃣
    "|(?:\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*)",
  "gu"
);

export interface EmojiOnlyResult {
  isEmojiOnly: boolean;
  /** Number of distinct emoji characters (grapheme-level, not code points). */
  count: number;
}

/**
 * Checks whether `text` consists of nothing but 1-3 emoji characters
 * (whitespace between them is ignored, matching how WhatsApp treats
 * "🎉 🎉" the same as "🎉🎉"). Returns count so the caller can pick the
 * right size tier.
 */
export function getEmojiOnlyInfo(text: string): EmojiOnlyResult {
  const trimmed = text.trim();
  if (!trimmed) return { isEmojiOnly: false, count: 0 };

  const matches = [...trimmed.matchAll(EMOJI_TOKEN)];
  const matchedLength = matches.reduce((sum, m) => sum + m[0].length, 0);
  // Whatever's left after removing every matched emoji token and all
  // whitespace must be empty for this to count as "emoji only".
  const remainder = trimmed.replace(EMOJI_TOKEN, "").replace(/\s+/g, "");

  if (remainder.length > 0 || matches.length === 0) {
    return { isEmojiOnly: false, count: 0 };
  }
  // matchedLength is unused beyond the remainder check above, but kept
  // for clarity of intent (silences no-unused-vars without an eslint
  // comment) — remainder is what actually decides "only emoji".
  void matchedLength;

  return { isEmojiOnly: matches.length >= 1 && matches.length <= 3, count: matches.length };
}

/** Tailwind text-size class per WhatsApp/iMessage's step-down: 1 emoji
 *  biggest, shrinking through 2 and 3, matching the "jumbomoji" tiers
 *  both apps use before reverting to normal size at 4+. */
export function jumboEmojiSizeClass(count: number): string {
  if (count <= 1) return "text-6xl leading-none";
  if (count === 2) return "text-5xl leading-none";
  return "text-4xl leading-none"; // count === 3
}
