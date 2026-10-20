// src/hooks/useReactions.ts
import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useMutationState } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useSound } from "./useSound";
import { useActiveIdentity, useActivePagePermissions } from "./usePages";
import { PROFILE_ROLES_SELECT, toProfileRoles } from "../lib/profileRoles";
import { DEBUG_DISABLE_PER_CARD_QUERIES } from "../lib/debugFlags";
import type { ReactionType } from "../types/database";
import { PAGE_SELECT } from "../lib/postSelects";
import {
  applyCommentIntent,
  COMMENT_REACTION_MUTATION_KEY,
  commentReactionScope,
  REACTION_MUTATION_KEY,
  reactionScope,
  type CommentReactionIntent,
  type CommentReactionState,
  type ReactionIntent,
} from "../lib/offlineMutations";

type TargetType = "post" | "comment" | "project";

const COLUMN_FOR: Record<TargetType, "post_id" | "comment_id" | "project_id"> = {
  post: "post_id",
  comment: "comment_id",
  project: "project_id",
};

/**
 * Checks whether the current user has already reacted to a post or
 * project with a given type. Comments no longer go through this hook
 * — see useMyCommentReactions below — because a thread with N
 * comments was mounting 2N of these (like + dislike, per comment),
 * which is what made reacting to comments feel unreliable: on a slow
 * connection that many concurrent requests queue, get rate-limited,
 * or lose the race with a fast second tap.
 *
 * `.limit(1)` before `.maybeSingle()` is deliberate, not redundant:
 * if a race ever produces more than one reaction row for the same
 * (user, target, type) — see 25_fix_reaction_duplicates.sql — PostgREST
 * throws on `.maybeSingle()` when the *query itself* would return more
 * than one row. Limiting to 1 first means this query degrades to "the
 * reaction still shows as active" instead of erroring out and getting
 * the like/dislike button stuck, even before that migration is applied
 * or if a duplicate ever slips through some other way.
 *
 * Item 7: also scoped to the currently ACTING identity — a page and
 * the person running it now keep fully separate like/dislike state
 * (see sql/29_page_identity_engagement.sql, reactions.acted_as_page_id).
 * Without this, switching into Page mode would show "already liked"
 * on things only the person, not the page, had liked, or vice versa.
 *
 * `enabled` (default true) lets a caller defer this — see PostCard's
 * `active` prop, which Feed.tsx sets false for cards in a feed tab the
 * visitor hasn't swiped to yet. Every PostCard calls this twice (like +
 * dislike), so on a feed page with all tabs mounted at once (see
 * SwipeableTabs.tsx) that's a real fan-out of simultaneous requests
 * otherwise — most of it for tabs nobody's looking at yet.
 */
export function useMyReaction(
  targetId: string,
  targetType: "post" | "project",
  type: ReactionType,
  enabled: boolean = true
) {
  const { user } = useAuth();
  const { data: identity } = useActiveIdentity();
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;
  const column = COLUMN_FOR[targetType];

  return useQuery({
    queryKey: ["my-reaction", targetType, targetId, type, user?.id, actingAsPageId],
    queryFn: async () => {
      if (!user) return null;
      let query = supabase
        .from("reactions")
        .select("id")
        .eq(column, targetId)
        .eq("user_id", user.id)
        .eq("type", type);
      query = actingAsPageId ? query.eq("acted_as_page_id", actingAsPageId) : query.is("acted_as_page_id", null);
      const { data } = await query.limit(1).maybeSingle();
      return data;
    },
    enabled: !!user && enabled && !DEBUG_DISABLE_PER_CARD_QUERIES,
  });
}

/**
 * Offline-first reaction toggle for a post or project (see lib/offlineMutations.ts and docs/OFFLINE_FIRST.md).
 *
 * `mutate(currentlyActive)` takes what the user SEES (use the overlay's `active`), and enqueues an idempotent
 * intent ("I want this reacted: yes/no"). It returns immediately: the screen updates from useReactionOverlay,
 * the write goes to Supabase as soon as there is a connection, and if the app is killed while offline the queued
 * intent is restored from the encrypted SQLite store and replayed. Rapid taps are fine — intents for one target
 * share a scope, so they run in order.
 *
 * Item 7: the intent carries acted_as_page_id from the identity active at tap time, so a like made as a page is
 * the PAGE's like and never collides with the person's own.
 */
export function useToggleReaction(targetId: string, targetType: "post" | "project", type: ReactionType) {
  const { user } = useAuth();
  const { data: identity } = useActiveIdentity();
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;
  const pagePerms = useActivePagePermissions();
  const { play } = useSound();

  const { mutate: enqueue } = useMutation<void, Error, ReactionIntent>({
    mutationKey: REACTION_MUTATION_KEY,
    scope: { id: reactionScope({ targetType, targetId, type, actingAsPageId }) },
  });

  const mutate = useCallback(
    (currentlyActive: boolean) => {
      if (!user) return;
      const active = !currentlyActive;
      if (active && actingAsPageId && !pagePerms.can("comment")) {
        console.warn("You don't have permission to react as this page.");
        return;
      }
      // Sound on the tap itself — un-liking shouldn't play anything.
      if (active && type === "like") play("like");
      enqueue({ targetType, targetId, type, active, userId: user.id, actingAsPageId, queuedAt: Date.now() });
    },
    [user, actingAsPageId, pagePerms, play, enqueue, targetType, targetId, type]
  );

  return { mutate };
}

/**
 * What to RENDER for a reaction: server state overlaid with any not-yet-confirmed intent (pending, retrying, or
 * paused offline — including ones restored after an app restart). `countDelta` is added to the row's *_count.
 */
export function useReactionOverlay(targetId: string, targetType: "post" | "project", type: ReactionType, serverActive: boolean) {
  const { data: identity } = useActiveIdentity();
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;
  const pending = useMutationState({
    filters: { mutationKey: REACTION_MUTATION_KEY, status: "pending" },
    select: (m) => m.state.variables as ReactionIntent | undefined,
  });

  let intent: boolean | undefined;
  for (const v of pending) {
    if (v && v.targetId === targetId && v.targetType === targetType && v.type === type && v.actingAsPageId === actingAsPageId) intent = v.active;
  }
  return {
    active: intent ?? serverActive,
    countDelta: intent === undefined ? 0 : (intent ? 1 : 0) - (serverActive ? 1 : 0),
    pending: intent !== undefined,
  };
}

// --- Comment reactions -----------------------------------------------
//
// Comments get their own pair of hooks instead of reusing
// useMyReaction/useToggleReaction above. A comment thread can hold
// dozens of comments, and the old approach mounted one useMyReaction
// query per comment per reaction type (like + dislike), i.e. 2N
// requests just to paint the thread's reaction state. That's the
// likely cause of "liking/disliking a comment doesn't work" — on
// anything but a fast connection, some of those N+1 requests queue,
// time out, or get rate-limited, so the button's active state either
// never loads or loads inconsistently between comments. See the
// Supabase N+1 write-up: https://axonbuild.com/blog/n-plus-1-query-problem
//
// The fix: one batched query per post for all of the current user's
// comment reactions, plus an optimistic update on toggle so the
// button responds instantly instead of waiting on a round trip.

export type { CommentReactionState };

type CommentReactionMap = Map<string, CommentReactionState>;
export type CommentCountDeltas = ReadonlyMap<string, { like: number; dislike: number }>;
const NO_DELTAS: CommentCountDeltas = new Map();

// The key carries the ids themselves (sorted), not just how many there are: the opened-comment page swaps its
// whole id set when you move from one comment to another, and two different sets can have the same size.
function commentReactionsQueryKey(postId: string, userId: string | undefined, actingAsPageId: string | null, commentIds: string[]) {
  return ["my-comment-reactions", postId, userId, actingAsPageId, [...commentIds].sort().join(",")] as const;
}

/**
 * One batched request for every comment reaction the current user has in a thread (not 2N per-comment queries),
 * scoped to the active identity. `data` is already overlaid with unconfirmed intents, and `deltas` says how much
 * to add to each comment's like_count/dislike_count so the numbers move the instant the user taps.
 */
export function useMyCommentReactions(postId: string, commentIds: string[]) {
  const { user } = useAuth();
  const { data: identity } = useActiveIdentity();
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;
  const hasComments = commentIds.length > 0;

  const query = useQuery({
    queryKey: commentReactionsQueryKey(postId, user?.id, actingAsPageId, commentIds),
    queryFn: async (): Promise<CommentReactionMap> => {
      const map: CommentReactionMap = new Map();
      if (!user || !hasComments) return map;

      let q = supabase
        .from("reactions")
        .select("comment_id, type")
        .eq("user_id", user.id)
        .eq("target_type", "comment")
        .in("comment_id", commentIds);
      q = actingAsPageId ? q.eq("acted_as_page_id", actingAsPageId) : q.is("acted_as_page_id", null);
      const { data, error } = await q;
      if (error) throw error;

      for (const row of data ?? []) {
        const entry = map.get(row.comment_id) ?? { liked: false, disliked: false };
        if (row.type === "like") entry.liked = true;
        if (row.type === "dislike") entry.disliked = true;
        map.set(row.comment_id, entry);
      }
      return map;
    },
    enabled: !!user && hasComments,
    // The key changes whenever more comments load (more ids). Keep showing the previous map meanwhile so
    // hearts don't blink back to un-liked while the wider batch is fetched.
    placeholderData: (previous) => previous,
  });

  const pending = useMutationState({
    filters: { mutationKey: COMMENT_REACTION_MUTATION_KEY, status: "pending" },
    select: (m) => m.state.variables as CommentReactionIntent | undefined,
  });

  const base = query.data;
  const view = useMemo(() => {
    const mine = pending.filter((v): v is CommentReactionIntent => !!v && v.postId === postId && v.actingAsPageId === actingAsPageId);
    if (mine.length === 0) return { map: base, deltas: NO_DELTAS };

    const map: CommentReactionMap = new Map(base ?? []);
    for (const v of mine) map.set(v.commentId, applyCommentIntent(map.get(v.commentId), v.type, v.active));

    const deltas = new Map<string, { like: number; dislike: number }>();
    for (const id of new Set(mine.map((v) => v.commentId))) {
      const before = base?.get(id);
      const after = map.get(id)!;
      deltas.set(id, {
        like: (after.liked ? 1 : 0) - (before?.liked ? 1 : 0),
        dislike: (after.disliked ? 1 : 0) - (before?.disliked ? 1 : 0),
      });
    }
    return { map, deltas: deltas as CommentCountDeltas };
  }, [pending, base, postId, actingAsPageId]);

  return { ...query, data: view.map, deltas: view.deltas };
}

interface ToggleCommentReactionInput {
  commentId: string;
  type: Extract<ReactionType, "like" | "dislike">;
  /** What the user currently SEES (the overlaid state from useMyCommentReactions). */
  currentlyActive: boolean;
}

/**
 * Offline-first like/dislike on one comment. Shared across every comment on the page. The intent is queued
 * instantly; the page renders from useMyCommentReactions (overlay) and the write is replayed until it lands.
 * `_knownCommentCount` is kept only for call-site compatibility — there is no per-key optimistic cache write
 * to keep in sync any more.
 */
export function useToggleCommentReaction(postId: string, _knownCommentCount?: number) {
  const { user } = useAuth();
  const { data: identity } = useActiveIdentity();
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;
  const pagePerms = useActivePagePermissions();
  const { play } = useSound();

  const { mutate: enqueue, isError } = useMutation<void, Error, CommentReactionIntent>({
    mutationKey: COMMENT_REACTION_MUTATION_KEY,
    scope: { id: commentReactionScope(postId, actingAsPageId) },
  });

  const mutate = useCallback(
    ({ commentId, type, currentlyActive }: ToggleCommentReactionInput) => {
      if (!user) return;
      const active = !currentlyActive;
      if (active && actingAsPageId && !pagePerms.can("comment")) {
        console.warn("You don't have permission to react as this page.");
        return;
      }
      if (type === "like" && active) play("like");
      enqueue({ postId, commentId, type, active, userId: user.id, actingAsPageId, queuedAt: Date.now() });
    },
    [user, actingAsPageId, pagePerms, play, enqueue, postId]
  );

  return { mutate, isError };
}

// Full list of posts the current user has liked — for the Activity
// hub's "Liked" tab. Same join shape as useBookmarkedPosts (roles
// included and flattened the same way PostCard requires elsewhere).
// Deliberately NOT scoped to active identity — "things I've liked"
// stays a personal-account concept regardless of which mode is
// active when this tab happens to be opened; a page's own liked
// list, if that's wanted later, is a separate surface (probably on
// PagePage), not this hub.
export function useLikedPosts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["liked-posts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reactions")
        .select(
          `post:posts!reactions_post_id_fkey(*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, tier, is_private, is_verified, badge_visible, ${PROFILE_ROLES_SELECT}), ${PAGE_SELECT})`
        )
        .eq("type", "like")
        .eq("target_type", "post")
        .eq("user_id", user?.id ?? "")
        .is("acted_as_page_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((row: any) => row.post)
        .filter(Boolean)
        .map((post: any) => {
          const { profile_roles, ...author } = post.author ?? {};
          return { ...post, author: { ...author, roles: toProfileRoles(profile_roles) } };
        });
    },
    enabled: !!user,
  });
}

// Full list of projects the current user has liked — same pattern,
// for the Activity hub's "Liked" tab, Projects side. Same personal-
// only scoping as useLikedPosts above.
export function useLikedProjects() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["liked-projects", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reactions")
        .select(`project:projects!reactions_project_id_fkey(*)`)
        .eq("type", "like")
        .eq("target_type", "project")
        .eq("user_id", user?.id ?? "")
        .is("acted_as_page_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => row.project).filter(Boolean);
    },
    enabled: !!user,
  });
}
