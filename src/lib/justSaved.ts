// src/lib/justSaved.ts
//
// Hand-off between Compose and the Drafts / Scheduled lists: "which row did the person just add?" so that list
// can scroll to it and flag it. Compose lands on the list with a plain replace(), which can't carry a param
// worth trusting, hence this one-shot in-memory slot. It expires quickly so it can't flag a row on a later visit.

export type SavedKind = "draft" | "scheduled";

const TTL_MS = 15000;

let pending: { kind: SavedKind; id: string; at: number } | null = null;

export function setJustSaved(kind: SavedKind, id: string) {
  pending = { kind, id, at: Date.now() };
}

/** Reads without clearing (safe under React's double-invoked initialisers); pair with clearJustSaved(). */
export function peekJustSaved(kind: SavedKind): string | null {
  return pending && pending.kind === kind && Date.now() - pending.at < TTL_MS ? pending.id : null;
}

export function clearJustSaved() {
  pending = null;
}
