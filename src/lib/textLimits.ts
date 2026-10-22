// src/lib/textLimits.ts

// Single source of truth for the max length of user-authored long-form
// text: post content, stance comments (support/pushback/question/comment), and
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
export function contentCounterClass(length: number, limit: number = CONTENT_LIMIT): string {
  return length > limit * 0.9 ? "text-danger" : "text-ink-muted";
}

// Posts get a tiered cap. Everyone gets CONTENT_LIMIT (450); users whose
// profiles.is_verified is true get VERIFIED_POST_LIMIT (1,200). The gate is
// is_verified — the permanent, admin-assigned status — NOT badge_visible, so
// a verified user whose badge is hidden for missing the weekly posting streak
// keeps the longer limit. Comments, stances and project descriptions stay at
// CONTENT_LIMIT for everyone. The create-post and update-post edge functions
// enforce the same two numbers server-side (and the posts_content_check DB
// constraint is the 1,200 ceiling), so keep all of these in sync.
export const VERIFIED_POST_LIMIT = 1200;

export function postContentLimit(isVerified: boolean | null | undefined): number {
  return isVerified ? VERIFIED_POST_LIMIT : CONTENT_LIMIT;
}
