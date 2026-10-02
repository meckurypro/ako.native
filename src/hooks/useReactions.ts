// src/hooks/useReactions.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useSound } from "./useSound";
import { useActiveIdentity } from "./usePages";
import { PROFILE_ROLES_SELECT, toProfileRoles } from "../lib/profileRoles";
import { DEBUG_DISABLE_PER_CARD_QUERIES } from "../lib/debugFlags";
import type { ReactionType } from "../types/database";
import { PAGE_SELECT } from "../lib/postSelects";

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

// Postgres unique_violation — see the partial unique indexes added in
// 25_fix_reaction_duplicates.sql (and re-created, actor-aware, in
// sql/29_page_identity_engagement.sql).
const UNIQUE_VIOLATION = "23505";

/**
 * Toggles a reaction on/off for a post or project. Reactions go
 * straight through RLS (no edge function needed) since they carry no
 * text and therefore don't need moderation.
 *
 * Optimistic + rollback, same pattern as useToggleCommentReaction
 * below — and for the same reason: a tap that visibly does nothing
 * until a round trip completes reads as "doesn't work" even when it
 * eventually succeeds. This also surfaces failures instead of
 * swallowing them: if the insert/delete is rejected server-side (see
 * the trg_notify_on_reaction / notifications.type constraint note on
 * useToggleCommentReaction's onError below — projects are the prime
 * suspect, since a "someone liked your project" notification type
 * may not be in that constraint's allow-list the way post/comment
 * likes are, which would explain why liking a project specifically
 * looks broken while liking a post doesn't), the button now snaps
 * back and the error is thrown for the caller to surface, rather than
 * silently no-op'ing the way a bare `.mutate()` with no onError did.
 *
 * Item 7: writes acted_as_page_id from whatever identity is currently
 * active, so a like made while acting as a page is the PAGE's like,
 * not the underlying person's — and doesn't collide with (or hide)
 * a like that same person already made personally.
 */
export function useToggleReaction(targetId: string, targetType: "post" | "project", type: ReactionType) {
  const { user } = useAuth();
  const { data: identity } = useActiveIdentity();
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;
  const queryClient = useQueryClient();
  const column = COLUMN_FOR[targetType];
  const queryKey = ["my-reaction", targetType, targetId, type, user?.id, actingAsPageId];
  const { play } = useSound();

  return useMutation({
    mutationFn: async (currentlyActive: boolean) => {
      if (!user) throw new Error("Not signed in");

      if (currentlyActive) {
        let query = supabase
          .from("reactions")
          .delete()
          .eq(column, targetId)
          .eq("user_id", user.id)
          .eq("type", type);
        query = actingAsPageId ? query.eq("acted_as_page_id", actingAsPageId) : query.is("acted_as_page_id", null);
        const { error } = await query;
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reactions").insert({
          [column]: targetId,
          user_id: user.id,
          type,
          target_type: targetType,
          acted_as_page_id: actingAsPageId,
        });
        // A second tap that landed before the first one's optimistic
        // state settled hits the unique index instead of creating a
        // duplicate — the end state (reacted) is already what this
        // call wanted, so treat it as a success rather than an error
        // toast the user didn't do anything to deserve.
        if (error && error.code !== UNIQUE_VIOLATION) throw error;
      }
    },
    onMutate: async (currentlyActive) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      // Shape only needs to be truthy/falsy for isLikedQuery.data below
      // — {id: "optimistic"} vs null mirrors what the real query returns.
      queryClient.setQueryData(queryKey, currentlyActive ? null : { id: "optimistic" });
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
      console.error(`${targetType} reaction failed:`, err);
    },
    onSuccess: (_data, currentlyActive) => {
      // currentlyActive is the state *before* this toggle — false means
      // this call just turned the reaction on, which is the only
      // direction worth a sound (un-liking shouldn't play anything).
      if (type === "like" && !currentlyActive) play("like");

      queryClient.invalidateQueries({ queryKey: ["my-reaction", targetType, targetId, type] });
      if (targetType === "post") {
        queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      } else {
        // Project like_count is read off several different queries
        // depending on where the card is rendered — profile tab,
        // detail page, or the "similar projects" rail — so all need
        // a refetch for the new count to show up everywhere.
        queryClient.invalidateQueries({ queryKey: ["user-projects"] });
        queryClient.invalidateQueries({ queryKey: ["project", targetId] });
        queryClient.invalidateQueries({ queryKey: ["project-detail", targetId] });
        queryClient.invalidateQueries({ queryKey: ["similar-projects"] });
        queryClient.invalidateQueries({ queryKey: ["saved-projects"] });
        queryClient.invalidateQueries({ queryKey: ["liked-projects"] });
      }
    },
  });
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

export interface CommentReactionState {
  liked: boolean;
  disliked: boolean;
}

type CommentReactionMap = Map<string, CommentReactionState>;

// The set of comment ids CommentSheet knows about only ever grows
// (roots on load, plus each reply batch as a thread gets expanded —
// see the knownIds accumulator in CommentSheet.tsx), so the id
// COUNT is a safe, cheap stand-in for "which ids" in the query key:
// it changes exactly when there's genuinely new coverage to fetch,
// and never shrinks back into colliding with an earlier, smaller
// request the way reusing a mid-session snapshot of the array could.
function commentReactionsQueryKey(
  postId: string,
  userId: string | undefined,
  actingAsPageId: string | null,
  knownCommentCount: number
) {
  return ["my-comment-reactions", postId, userId, actingAsPageId, knownCommentCount] as const;
}

// Fetches every comment reaction the current user has among the
// currently-known comment ids for one post's thread, in a single
// request, instead of one request per comment per reaction type. As
// more replies get lazily expanded and commentIds grows, this
// naturally re-fetches (see the key above) to cover the newly-visible
// ones too. Item 7: scoped to the active identity, same reasoning as
// useMyReaction above.
export function useMyCommentReactions(postId: string, commentIds: string[]) {
  const { user } = useAuth();
  const { data: identity } = useActiveIdentity();
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;
  const hasComments = commentIds.length > 0;

  return useQuery({
    queryKey: commentReactionsQueryKey(postId, user?.id, actingAsPageId, commentIds.length),
    queryFn: async (): Promise<CommentReactionMap> => {
      const map: CommentReactionMap = new Map();
      if (!user || !hasComments) return map;

      let query = supabase
        .from("reactions")
        .select("comment_id, type")
        .eq("user_id", user.id)
        .eq("target_type", "comment")
        .in("comment_id", commentIds);
      query = actingAsPageId ? query.eq("acted_as_page_id", actingAsPageId) : query.is("acted_as_page_id", null);
      const { data, error } = await query;
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
  });
}

interface ToggleCommentReactionInput {
  commentId: string;
  type: Extract<ReactionType, "like" | "dislike">;
  currentlyActive: boolean;
}

// Toggles a like or dislike on one comment. Shared across every
// comment in the sheet (CommentSheet creates one instance and
// passes it down), so a tap on any comment's button hits the same
// optimistic-update path. `knownCommentCount` must be the same value
// CommentSheet is currently passing to useMyCommentReactions, so the
// optimistic write below lands on the exact cache entry that's
// actually being read.
export function useToggleCommentReaction(postId: string, knownCommentCount: number) {
  const { user } = useAuth();
  const { data: identity } = useActiveIdentity();
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;
  const queryClient = useQueryClient();
  const queryKey = commentReactionsQueryKey(postId, user?.id, actingAsPageId, knownCommentCount);
  const { play } = useSound();

  return useMutation({
    mutationFn: async ({ commentId, type, currentlyActive }: ToggleCommentReactionInput) => {
      if (!user) throw new Error("Not signed in");

      if (currentlyActive) {
        let query = supabase
          .from("reactions")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", user.id)
          .eq("type", type);
        query = actingAsPageId ? query.eq("acted_as_page_id", actingAsPageId) : query.is("acted_as_page_id", null);
        const { error } = await query;
        if (error) throw error;
        return;
      }

      // Mutual exclusion: a like and a dislike from the same person on
      // the same comment shouldn't coexist. Clear the opposite type
      // first so switching from one to the other is one consistent
      // action rather than leaving both rows behind. Scoped to the
      // same actor (person or page) as the insert below, so this never
      // clears the OTHER identity's opposite reaction.
      const opposite = type === "like" ? "dislike" : "like";
      let clearOpposite = supabase
        .from("reactions")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", user.id)
        .eq("type", opposite);
      clearOpposite = actingAsPageId
        ? clearOpposite.eq("acted_as_page_id", actingAsPageId)
        : clearOpposite.is("acted_as_page_id", null);
      await clearOpposite;

      const { error } = await supabase.from("reactions").insert({
        comment_id: commentId,
        user_id: user.id,
        type,
        target_type: "comment",
        acted_as_page_id: actingAsPageId,
      });
      // Same race as the post/project version above — a second tap
      // landing before the first settles hits the unique index rather
      // than creating a duplicate. Treat it as a no-op success.
      if (error && error.code !== UNIQUE_VIOLATION) throw error;
    },
    // Flip the button immediately rather than waiting on the round
    // trip — this is the other half of the reliability fix, since a
    // tap that visibly does nothing for a second or more reads as
    // "doesn't work" even when the request eventually succeeds.
    onMutate: async ({ commentId, type, currentlyActive }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CommentReactionMap>(queryKey);

      const next: CommentReactionMap = new Map(previous ?? []);
      const entry = { ...(next.get(commentId) ?? { liked: false, disliked: false }) };
      const nowActive = !currentlyActive;
      if (type === "like") {
        entry.liked = nowActive;
        if (nowActive) entry.disliked = false;
      } else {
        entry.disliked = nowActive;
        if (nowActive) entry.liked = false;
      }
      next.set(commentId, entry);
      queryClient.setQueryData(queryKey, next);

      if (type === "like" && nowActive) play("like");

      return { previous };
    },
    onError: (err, _vars, context) => {
      // Roll back to whatever the cache held before the optimistic
      // update so a failed request doesn't leave a button stuck
      // showing a reaction that was never actually saved. Check
      // `context` itself, not `context.previous` — onMutate always
      // returns a `{ previous }` object even when `previous` is
      // undefined (e.g. the initial fetch never populated the
      // cache), and `context?.previous` being falsy in that case
      // used to skip the rollback entirely, leaving a phantom
      // optimistic reaction that a failed request could never
      // correct (see useToggleReaction's onError above for the
      // version that gets this right).
      if (context) queryClient.setQueryData(queryKey, context.previous);
      // A reaction that reliably reverts the instant it's tapped means
      // the insert/delete itself is being rejected server-side (a
      // trigger error or constraint), not a flaky network blip — this
      // log is what distinguishes the two. See trg_notify_on_reaction /
      // notifications.type constraint as the current leading suspect.
      console.error("Comment reaction failed:", err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      // like_count/dislike_count on the comment row itself come from
      // this query, so it needs a refetch too for the visible number
      // to move.
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
    },
  });
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
          `post:posts!reactions_post_id_fkey(*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, tier, is_private, is_verified, ${PROFILE_ROLES_SELECT}), ${PAGE_SELECT})`
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
