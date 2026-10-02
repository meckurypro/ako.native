// src/lib/debugFlags.ts
// TEMP DIAGNOSTIC FILE — not meant to ship long-term.
//
// Single place to flip isolated test switches while debugging the
// swipe "bounce" on Liked/Feed. Each flag should be false by default;
// flip one at a time, test, then revert before moving to the next.

// When true, skips the four per-card queries PostCard normally fires
// (bookmark state, like, dislike, has-reshared) — they'll just render
// with static/empty values instead of hitting Supabase. Used to test
// whether the query fan-out + re-render churn from many PostCards
// mounting at once is what's competing with touchmove for main-thread
// time during a swipe.
export const DEBUG_DISABLE_PER_CARD_QUERIES = false;
