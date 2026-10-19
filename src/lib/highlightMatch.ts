// src/lib/highlightMatch.ts
//
// Splits `text` around the first case-insensitive occurrence of `query`, so a
// suggestion row can render the typed part and the rest differently (the way
// TikTok emphasises the completion). Returns null when there's no match.

export interface MatchParts {
  before: string;
  match: string;
  after: string;
}

export function splitMatch(text: string, query: string): MatchParts | null {
  const q = query.trim();
  if (!q) return null;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) return null;
  return {
    before: text.slice(0, index),
    match: text.slice(index, index + q.length),
    after: text.slice(index + q.length),
  };
}
