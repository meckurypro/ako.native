// src/lib/justPosted.ts
//
// Hand-off between Compose and Feed for "pin the post I just made at the top of For You". Compose returns to
// whichever screen opened it with ordinary back navigation, which can't carry route params — hence this
// one-shot, in-memory slot. Feed reads it when it regains focus.
//
// The slot expires quickly: if Compose returned to some other screen (a profile, a Page), the hint must not
// linger and pin a post the next time the person happens to open the Feed.

const TTL_MS = 5000;

let pending: { id: string; at: number } | null = null;

export function setJustPosted(id: string) {
  pending = { id, at: Date.now() };
}

export function consumeJustPosted(): string | null {
  const hit = pending;
  pending = null;
  return hit && Date.now() - hit.at < TTL_MS ? hit.id : null;
}

// Compose redirects to the Feed the instant "Post" is tapped, before the server has answered, so it can only hand
// over a PENDING result: a promise for the new post's id (null if posting failed, in which case Compose puts the
// person back on the editor). It expires like the id above so it can't pin a post on some later visit.
let pendingResult: { result: Promise<string | null>; at: number } | null = null;

export function setJustPostedPending(result: Promise<string | null>) {
  pendingResult = { result, at: Date.now() };
}

export function consumeJustPostedPending(): Promise<string | null> | null {
  const hit = pendingResult;
  pendingResult = null;
  return hit && Date.now() - hit.at < TTL_MS ? hit.result : null;
}
