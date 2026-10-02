// src/lib/feedDoorwayCopy.ts
//
// Small, hand-written copy set for the "soft Feed discovery" doorway
// (see FeedDoorway.tsx / useFeedDoorway.ts). Deliberately not a
// database-editable table — see the spec's own guidance (04_AKO_SOFT_
// FEED_DISCOVERY...md, "Copy Configuration"): this is product-critical
// UX copy with a small, fixed set of contexts, so it's versioned in
// code like any other component string, not exposed as Admin-editable
// content. If Akọ later gets a real Admin copy-management system and
// wants these in it, move them then — don't build that just for this.
//
// Every context here maps to exactly one natural stopping point
// audited in the repo (see FEED_DOORWAY_CONTEXTS below for where each
// one is wired up). Keep this list short — one destination should
// pick the single most natural context, not stack several.
export type FeedDoorwayContextKey = "book" | "course_complete" | "ticket" | "generic";

export interface FeedDoorwayCopy {
  heading: string;
  subtext: string;
  cta: string;
}

// One variant per context — no A/B grab-bag, no random selection.
// Randomizing copy for its own sake reads as noise, not personality.
export const FEED_DOORWAY_COPY: Record<FeedDoorwayContextKey, FeedDoorwayCopy> = {
  book: {
    heading: "Enjoy the book.",
    subtext: "When you're ready, see what else is happening on Akọ.",
    cta: "Explore the feed",
  },
  course_complete: {
    heading: "You made it to the end.",
    subtext: "Don't stop there.",
    cta: "See what's happening on Akọ",
  },
  ticket: {
    heading: "You're all set.",
    subtext: "There's more happening on Akọ before the event.",
    cta: "See what's happening",
  },
  // Fallback for any future call site that hasn't earned a bespoke
  // line yet. Kept intentionally plain rather than reused from one of
  // the specific contexts above, so a lazy call site is obvious in
  // review rather than silently borrowing someone else's copy.
  generic: {
    heading: "That's sorted.",
    subtext: "There's more happening on Akọ.",
    cta: "Explore the feed",
  },
};
