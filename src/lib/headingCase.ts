// src/lib/headingCase.ts
// Post headings always DISPLAY with each word's first letter capitalised and the rest lower-case
// ("SKILLS or CERTIFICATES?" -> "Skills Or Certificates?"). Display only: the stored text is untouched, so
// editing a post still shows exactly what was typed. Links and @mentions are left alone (they are case-sensitive).

export function formatHeading(text: string): string {
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim() || /^(https?:|www\.)|:\/\/|@/i.test(token)) return token;
      const lower = token.toLocaleLowerCase();
      return lower.replace(/\p{L}/u, (ch) => ch.toLocaleUpperCase());
    })
    .join("");
}
