// src/lib/textLimits.ts

// Single source of truth for the max length of user-authored long-form
// text: post content, stance comments (support/disagree/pushback), and
// project descriptions. They're all capped at the same number by
// product decision, not by coincidence — keeping one exported constant
// means changing that number later is a one-line edit here instead of
// hunting down every textarea that used to hardcode its own limit.
//
// Heading/title fields are intentionally separate (see HEADING_LIMIT in
// Compose.tsx/EditPost.tsx) since they're a different kind of field with
// their own, much shorter, cap.
export const CONTENT_LIMIT = 450;

// Shared class-name helper for the "x/450" counters next to these
// textareas: plain muted text normally, switching to the danger color
// once the user is close to the cap (matches the pattern already used
// for post content) so the warning shows up before they actually hit
// the hard stop the textarea's `maxLength` enforces.
export function contentCounterClass(length: number): string {
  return length > CONTENT_LIMIT * 0.9 ? "text-danger" : "text-ink-muted";
}
