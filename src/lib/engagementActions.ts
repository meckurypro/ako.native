// src/lib/engagementActions.ts
//
// The post's engagement actions and where each one lives. This is a product decision, not a ranking:
//   • In the tray, always, in this order: Like (fixed), then the three stances — Add, Question, Pushback. A stance is
//     one tap away on every post, so people choose one on purpose instead of defaulting to a generic comment.
//   • Everything else lives behind "···", in a fixed order that never reshuffles under the thumb.
// ("support" is the stored key for the action people see as "Add".)
export type SecondaryActionKey =
  | "support"
  | "question"
  | "pushback"
  | "share"
  | "reshare"
  | "save"
  | "gift"
  | "dislike";

/** The stance buttons shown in the tray, left to right, right after Like. */
export const TRAY_ORDER: SecondaryActionKey[] = ["support", "question", "pushback"];

/** "More" sheet: sharing first, the negative action (Dislike) last. */
export const MORE_ORDER: SecondaryActionKey[] = ["share", "reshare", "save", "gift", "dislike"];

/** Stances: need a published post, and an author can't question or push back on their own. */
export const STANCE_KEYS: SecondaryActionKey[] = ["support", "question", "pushback"];
