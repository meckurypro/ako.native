// src/lib/offlineMutations.ts
// Offline-first mutations: reactions (like/dislike/share on posts & projects), comment reactions, bookmarks.
//
// THE PATTERN (see docs/OFFLINE_FIRST.md):
//   1. The UI never waits for the network. A tap enqueues a mutation whose variables are a complete, serialisable
//      INTENT ("I want X to be liked by user U") — never "toggle".
//   2. While the mutation is pending (or paused offline), screens render  server state + pending-intent overlay.
//      Nothing is written into the server-state cache optimistically, so nothing needs rolling back: when the
//      mutation settles the overlay simply disappears (success → cache already patched; failure → UI reverts).
//   3. Mutations for one target share a `scope`, so they replay strictly in order (like → unlike → like).
//   4. Intents are idempotent (insert tolerates unique_violation, delete of a missing row is a no-op), so replaying
//      one after a crash or a retry is always safe.
//   5. Because functions can't be persisted, the mutationFn + onSuccess live HERE as mutation defaults, registered
//      at startup, so a mutation restored from SQLite after an app kill can run with no component mounted.
import { notifyManager, type QueryClient } from "@tanstack/react-query";

import type { ReactionType } from "../types/database";
import { adjustCountInCaches, COMMENT_QUERY_ROOTS, POST_QUERY_ROOTS, PROJECT_QUERY_ROOTS } from "./optimisticCache";
import { supabase } from "./supabase";

export const REACTION_MUTATION_KEY = ["reaction"] as const;
export const COMMENT_REACTION_MUTATION_KEY = ["comment-reaction"] as const;
export const BOOKMARK_MUTATION_KEY = ["bookmark"] as const;

/** Mutation-key roots that are safe to persist and replay after an app kill (all are idempotent intents). */
export const OFFLINE_MUTATION_ROOTS: ReadonlySet<string> = new Set(["reaction", "comment-reaction", "bookmark"]);

// Postgres unique_violation — the reaction/bookmark is already there, which is exactly the state we wanted.
const UNIQUE_VIOLATION = "23505";

export interface ReactionIntent {
  targetType: "post" | "project";
  targetId: string;
  type: ReactionType;
  /** The state the user wants after this action (true = reacted). */
  active: boolean;
  userId: string;
  actingAsPageId: string | null;
  /** Date.now() at tap time. */
  queuedAt: number;
}

export interface CommentReactionIntent {
  postId: string;
  commentId: string;
  type: "like" | "dislike";
  active: boolean;
  userId: string;
  actingAsPageId: string | null;
  queuedAt: number;
}

export interface BookmarkIntent {
  postId: string;
  active: boolean;
  userId: string;
  queuedAt: number;
}

export interface CommentReactionState {
  liked: boolean;
  disliked: boolean;
}

const COLUMN_FOR = { post: "post_id", project: "project_id" } as const;
const COUNT_FIELD: Partial<Record<ReactionType, string>> = { like: "like_count", dislike: "dislike_count" };

export const reactionScope = (i: Pick<ReactionIntent, "targetType" | "targetId" | "type" | "actingAsPageId">) =>
  `reaction:${i.targetType}:${i.targetId}:${i.type}:${i.actingAsPageId ?? "self"}`;
export const commentReactionScope = (postId: string, actingAsPageId: string | null) => `comment-reaction:${postId}:${actingAsPageId ?? "self"}`;
export const bookmarkScope = (postId: string) => `bookmark:${postId}`;

export const myReactionKey = (i: Pick<ReactionIntent, "targetType" | "targetId" | "type" | "userId" | "actingAsPageId">) =>
  ["my-reaction", i.targetType, i.targetId, i.type, i.userId, i.actingAsPageId] as const;

/** Transient failures (no network, 5xx) are retried; a database rejection (RLS, constraint) is final. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 4) return false;
  const code = (error as { code?: unknown } | null)?.code;
  return !code; // PostgREST errors carry a code; network failures don't
}

// ─── reactions ───────────────────────────────────────────────────────────────

async function sendReaction(i: ReactionIntent): Promise<void> {
  const column = COLUMN_FOR[i.targetType];
  if (!i.active) {
    let q = supabase.from("reactions").delete().eq(column, i.targetId).eq("user_id", i.userId).eq("type", i.type);
    q = i.actingAsPageId ? q.eq("acted_as_page_id", i.actingAsPageId) : q.is("acted_as_page_id", null);
    const { error } = await q;
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("reactions").insert({
    [column]: i.targetId,
    user_id: i.userId,
    type: i.type,
    target_type: i.targetType,
    acted_as_page_id: i.actingAsPageId,
  });
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
}

function onReactionConfirmed(qc: QueryClient, i: ReactionIntent) {
  const key = myReactionKey(i);
  const wasActive = !!qc.getQueryData(key); // what the cache (and so the screen) considered the server state
  const field = COUNT_FIELD[i.type];
  const delta = (i.active ? 1 : 0) - (wasActive ? 1 : 0);

  // ONE notification flush for every cache write below. The screen shows `row.like_count + overlayDelta`, where the
  // overlay delta depends on the my-reaction cache (serverActive) while the pending intent is still applied. If the
  // my-reaction write and the count patch reached React in separate flushes, there would be a frame where the
  // overlay has already "absorbed" the +1 (serverActive flipped) but the row still has the OLD count — the number
  // visibly dips back and then jumps again (n+1 → n → n+1). Batched, both land in the same commit.
  notifyManager.batch(() => {
    qc.setQueryData(key, i.active ? { id: "confirmed" } : null);
    if (!field || delta === 0) return;
    adjustCountInCaches(qc, {
      roots: i.targetType === "post" ? POST_QUERY_ROOTS : PROJECT_QUERY_ROOTS,
      id: i.targetId,
      field,
      delta,
      queuedAt: i.queuedAt,
    });
  });
}

// ─── comment reactions ───────────────────────────────────────────────────────

async function sendCommentReaction(i: CommentReactionIntent): Promise<void> {
  const scoped = <T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(q: T) =>
    i.actingAsPageId ? q.eq("acted_as_page_id", i.actingAsPageId) : q.is("acted_as_page_id", null);

  if (!i.active) {
    const { error } = await scoped(supabase.from("reactions").delete().eq("comment_id", i.commentId).eq("user_id", i.userId).eq("type", i.type));
    if (error) throw error;
    return;
  }
  // A like and a dislike from the same actor on the same comment must not coexist: clear the opposite first.
  const opposite = i.type === "like" ? "dislike" : "like";
  const { error: clearError } = await scoped(supabase.from("reactions").delete().eq("comment_id", i.commentId).eq("user_id", i.userId).eq("type", opposite));
  if (clearError) throw clearError;
  const { error } = await supabase.from("reactions").insert({
    comment_id: i.commentId,
    user_id: i.userId,
    type: i.type,
    target_type: "comment",
    acted_as_page_id: i.actingAsPageId,
  });
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
}

/** Applies an intent to one comment's reaction state (like and dislike are mutually exclusive). */
export function applyCommentIntent(state: CommentReactionState | undefined, type: "like" | "dislike", active: boolean): CommentReactionState {
  const next = { liked: !!state?.liked, disliked: !!state?.disliked };
  if (type === "like") {
    next.liked = active;
    if (active) next.disliked = false;
  } else {
    next.disliked = active;
    if (active) next.liked = false;
  }
  return next;
}

function onCommentReactionConfirmed(qc: QueryClient, i: CommentReactionIntent) {
  const prefix = ["my-comment-reactions", i.postId, i.userId, i.actingAsPageId];
  const maps = qc.getQueriesData<Map<string, CommentReactionState>>({ queryKey: prefix });
  const before = maps.map(([, m]) => m?.get(i.commentId)).find(Boolean) ?? { liked: false, disliked: false };
  const after = applyCommentIntent(before, i.type, i.active);

  // Single flush for the reaction-state write and both count patches — same reason as onReactionConfirmed.
  notifyManager.batch(() => {
    for (const [queryKey, map] of maps) {
      if (!map) continue;
      const next = new Map(map);
      next.set(i.commentId, after);
      qc.setQueryData(queryKey, next);
    }

    const common = { roots: COMMENT_QUERY_ROOTS, id: i.commentId, queuedAt: i.queuedAt };
    adjustCountInCaches(qc, { ...common, field: "like_count", delta: (after.liked ? 1 : 0) - (before.liked ? 1 : 0) });
    adjustCountInCaches(qc, { ...common, field: "dislike_count", delta: (after.disliked ? 1 : 0) - (before.disliked ? 1 : 0) });
  });
}

// ─── bookmarks ───────────────────────────────────────────────────────────────

async function sendBookmark(i: BookmarkIntent): Promise<void> {
  if (!i.active) {
    const { error } = await supabase.from("bookmarks").delete().eq("post_id", i.postId).eq("user_id", i.userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("bookmarks").insert({ post_id: i.postId, user_id: i.userId });
  if (error && error.code !== UNIQUE_VIOLATION) throw error;
}

function onBookmarkConfirmed(qc: QueryClient, i: BookmarkIntent) {
  qc.setQueryData(["is-bookmarked", i.postId, i.userId], i.active);
  // This mutation still counts as pending inside onSuccess; refresh the Saved list once the burst is over.
  if (qc.isMutating({ mutationKey: BOOKMARK_MUTATION_KEY }) <= 1) void qc.invalidateQueries({ queryKey: ["bookmarked-posts"] });
}

// ─── registration ────────────────────────────────────────────────────────────

const GC_TIME = 24 * 60 * 60 * 1000;

/** Call once, at module load of the QueryClient — BEFORE any persisted cache is restored. */
export function registerOfflineMutations(qc: QueryClient): void {
  qc.setMutationDefaults(REACTION_MUTATION_KEY, {
    mutationFn: (i: ReactionIntent) => sendReaction(i),
    onSuccess: (_d: unknown, i: ReactionIntent) => onReactionConfirmed(qc, i),
    onError: (e: unknown, i: ReactionIntent) => console.error(`${i.targetType} ${i.type} failed`, e),
    retry: shouldRetry,
    gcTime: GC_TIME,
  });
  qc.setMutationDefaults(COMMENT_REACTION_MUTATION_KEY, {
    mutationFn: (i: CommentReactionIntent) => sendCommentReaction(i),
    onSuccess: (_d: unknown, i: CommentReactionIntent) => onCommentReactionConfirmed(qc, i),
    onError: (e: unknown) => console.error("comment reaction failed", e),
    retry: shouldRetry,
    gcTime: GC_TIME,
  });
  qc.setMutationDefaults(BOOKMARK_MUTATION_KEY, {
    mutationFn: (i: BookmarkIntent) => sendBookmark(i),
    onSuccess: (_d: unknown, i: BookmarkIntent) => onBookmarkConfirmed(qc, i),
    onError: (e: unknown) => console.error("bookmark failed", e),
    retry: shouldRetry,
    gcTime: GC_TIME,
  });
}
