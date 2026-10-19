// src/lib/headingCase.ts
// Post headings are tidied for DISPLAY only when the author typed them entirely in CAPITALS or entirely in lower
// case: then each word's first letter is capitalised and the rest lower-cased
// ("SKILLS OR CERTIFICATES?" / "skills or certificates?" -> "Skills Or Certificates?").
// Anything with mixed case ("Skills or CERTIFICATES?", "my iPhone tips") shows exactly as typed, so deliberate
// capitals and emphasis are respected. The stored text is never changed, so editing a post shows what was typed.
// Links and @mentions are left alone (they are case-sensitive) and don't count when deciding whether the heading
// is all-caps or all-lower.

const PROTECTED = /^(https?:|www\.)|:\/\/|@/i;

function isUniformCase(text: string): boolean {
  let hasUpper = false;
  let hasLower = false;
  for (const token of text.split(/\s+/)) {
    if (!token || PROTECTED.test(token)) continue;
    for (const ch of token) {
      if (!/\p{L}/u.test(ch)) continue;
      const upper = ch.toLocaleUpperCase();
      const lower = ch.toLocaleLowerCase();
      if (upper === lower) continue; // caseless letter (e.g. CJK)
      if (ch === upper) hasUpper = true;
      else hasLower = true;
      if (hasUpper && hasLower) return false;
    }
  }
  return hasUpper || hasLower;
}

export function formatHeading(text: string): string {
  if (!isUniformCase(text)) return text;
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim() || PROTECTED.test(token)) return token;
      const lower = token.toLocaleLowerCase();
      return lower.replace(/\p{L}/u, (ch) => ch.toLocaleUpperCase());
    })
    .join("");
}
