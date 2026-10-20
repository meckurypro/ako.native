// src/hooks/useComments.ts
import { notifyManager, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adjustCountInCaches, COMMENT_QUERY_ROOTS, POST_QUERY_ROOTS } from "../lib/optimisticCache";
import { supabase } from "../lib/supabase";
import { resolveFunctionErrorMessage } from "../lib/functionErrors";
import { useActiveIdentity, useActivePagePermissions } from "./usePages";
import type { Comment, Stance } from "../types/database";

export interface CommentWithAuthor extends Comment {
  author: { id: string; username: string; display_name: string; avatar_url: string | null };
}

const COMMENT_SELECT = `*, author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)`;

export const COMMENT_PAGE_SIZE = 25;

/** "all", or one stance — the stance is always the reply's stance toward ITS parent (post or comment). */
export type StanceFilter = "all" | Stance;

/**
 * One level of a conversation, paged: the direct replies to a post (`parentCommentId = null`, i.e. top-level
 * comments) or to a comment. Opening a post or a comment only ever costs one page of ITS OWN children —
 * deeper levels are fetched when (and if) someone opens the comment they belong to.
 *
 * Oldest-first, so a thread reads in the order it happened and a new reply lands at the end of the list.
 */
export function useCommentList(postId: string, parentCommentId: string | null, filter: StanceFilter = "all") {
  return useInfiniteQuery({
    queryKey: ["comment-list", postId, parentCommentId, filter],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<CommentWithAuthor[]> => {
      let q = supabase.from("comments").select(COMMENT_SELECT).eq("post_id", postId).eq("is_deleted", false);
      q = parentCommentId ? q.eq("parent_comment_id", parentCommentId) : q.is("parent_comment_id", null);
      if (filter !== "all") q = q.eq("stance", filter);

      const from = pageParam * COMMENT_PAGE_SIZE;
      const { data, error } = await q
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + COMMENT_PAGE_SIZE - 1);
      if (error) throw error;
      return data as unknown as CommentWithAuthor[];
    },
    getNextPageParam: (lastPage, allPages) => (lastPage.length === COMMENT_PAGE_SIZE ? allPages.length : undefined),
    enabled: !!postId,
  });
}

/** A single comment, with its author — the "focal" comment of the opened-comment page. */
export function useComment(commentId: string | undefined) {
  return useQuery({
    queryKey: ["comment", commentId],
    queryFn: async (): Promise<CommentWithAuthor | null> => {
      const { data, error } = await supabase.from("comments").select(COMMENT_SELECT).eq("id", commentId!).maybeSingle();
      if (error) throw error;
      return (data as unknown as CommentWithAuthor) ?? null;
    },
    enabled: !!commentId,
  });
}

/**
 * Everything above a comment, root-first: its parent, that parent's parent, … up to the top-level comment.
 * One RPC for the lineage (get_comment_ancestor_ids) and one query for the rows. An entry is `null` when that
 * ancestor can't be shown (deleted, or hidden from this viewer) so the thread can say so instead of silently
 * skipping a level.
 */
export function useCommentChain(commentId: string | undefined) {
  return useQuery({
    queryKey: ["comment-chain", commentId],
    queryFn: async (): Promise<(CommentWithAuthor | null)[]> => {
      const { data: ids, error: idsError } = await supabase.rpc("get_comment_ancestor_ids", { p_comment_id: commentId! });
      if (idsError) throw idsError;
      const ordered: string[] = ((ids ?? []) as { id: string }[]).map((r) => r.id);
      if (ordered.length === 0) return [];

      const { data, error } = await supabase.from("comments").select(COMMENT_SELECT).in("id", ordered);
      if (error) throw error;
      const byId = new Map((data as unknown as CommentWithAuthor[]).map((c) => [c.id, c]));
      return ordered.map((id) => {
        const row = byId.get(id);
        return row && !row.is_deleted ? row : null;
      });
    },
    enabled: !!commentId,
  });
}

interface CreateCommentInput {
  post_id: string;
  content: string;
  stance?: Stance;
  parent_comment_id?: string;
}

export function useCreateComment(postId: string) {
  const queryClient = useQueryClient();
  const { data: identity } = useActiveIdentity();
  const pagePerms = useActivePagePermissions();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: CreateCommentInput) => {
      // Acting as a page, a comment is the PAGE's — never the team member's
      // own. (Before this, page mode quietly posted comments as the person.)
      const actingPage = identity?.mode === "page" ? identity.page : null;
      if (actingPage && !pagePerms.can("comment")) {
        throw new Error(`You don't have permission to comment as ${actingPage.name}.`);
      }

      const { data, error } = actingPage
        ? await supabase.functions.invoke("create-page-comment", { body: { ...input, page_id: actingPage.id } })
        : await supabase.functions.invoke("create-comment", { body: input });

      // See resolveFunctionErrorMessage (src/lib/functionErrors.ts) —
      // without this, a moderation rejection's actual message (e.g. the
      // word-filter's block message) never reaches the caller: on a
      // non-2xx response supabase-js discards create-comment's real
      // { error: "..." } body and only gives back a generic "Edge
      // Function returned a non-2xx status code".
      if (error) throw new Error(await resolveFunctionErrorMessage(error, "Couldn't post this."));
      if (data?.error) throw new Error(data.error);

      return data.comment;
    },
    onMutate: () => ({ queuedAt: Date.now() }),
    onSuccess: (comment: Comment | undefined, input, ctx) => {
      const queuedAt = ctx?.queuedAt ?? Date.now();
      const stance = comment?.stance ?? input.stance ?? null;
      const parentId = comment?.parent_comment_id ?? input.parent_comment_id ?? null;
      const stanceField = stance ? `${stance}_count` : null;

      // Counts move the instant the reply is accepted — mirrors what the database triggers just did
      // (update_post_stance_counts): the post's comment_count, its per-stance total for a top-level comment, and
      // for a reply the parent comment's reply_count + per-stance total. If a live update already landed first,
      // adjustCountInCaches notices and refetches instead of adding on top.
      notifyManager.batch(() => {
        adjustCountInCaches(queryClient, { roots: POST_QUERY_ROOTS, id: postId, field: "comment_count", delta: 1, queuedAt });
        if (!parentId && stanceField) adjustCountInCaches(queryClient, { roots: POST_QUERY_ROOTS, id: postId, field: stanceField, delta: 1, queuedAt });
        if (parentId) {
          adjustCountInCaches(queryClient, { roots: COMMENT_QUERY_ROOTS, id: parentId, field: "reply_count", delta: 1, queuedAt });
          if (stanceField) adjustCountInCaches(queryClient, { roots: COMMENT_QUERY_ROOTS, id: parentId, field: stanceField, delta: 1, queuedAt });
        }
      });

      // The new reply itself: prefix match refreshes every loaded page / stance filter of this post's reply lists,
      // whichever level (the post's, or any opened comment's) it landed in. Other people's replies arrive the same
      // way via the live thread channel.
      void queryClient.invalidateQueries({ queryKey: ["comment-list", postId] });
    },
  });
}

/**
 * A comment is editable until anyone engages with it. This is the cheap client-side read of that rule off the
 * stored counts; gifts aren't counted here, so update-comment (and the comments_enforce_edit_rules trigger)
 * stay the authority and answer with a clear error if someone has engaged in a way the counts don't show.
 */
export function canEditComment(c: Pick<Comment, "like_count" | "dislike_count" | "reply_count">): boolean {
  return c.like_count + c.dislike_count + c.reply_count === 0;
}

/** Edits a comment's text via update-comment (moderated; refused once anyone has engaged). */
export function useUpdateComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: { comment_id: string; content: string }) => {
      const { data, error } = await supabase.functions.invoke("update-comment", { body: input });
      if (error) throw new Error(await resolveFunctionErrorMessage(error, "Couldn't save your edit."));
      if (data?.error) throw new Error(data.error);
      return data.comment as Comment | undefined;
    },
    onSettled: (_data, _err, input) => {
      // Settled, not just success: if the edit was refused because someone engaged, the refetch also
      // refreshes the stored counts so the Edit option disappears.
      void queryClient.invalidateQueries({ queryKey: ["comment-list", postId] });
      void queryClient.invalidateQueries({ queryKey: ["comment", input.comment_id] });
    },
  });
}

/**
 * Authors can always delete their own comment. A soft delete — the comment_soft_delete_counts trigger moves the
 * counters, so this mirrors it locally (same approach as useCreateComment) and refetches only the thread.
 */
export function useDeleteComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (comment: { id: string; parent_comment_id: string | null; stance: Comment["stance"] }) => {
      const { error } = await supabase.from("comments").update({ is_deleted: true }).eq("id", comment.id);
      if (error) throw error;
    },
    onMutate: () => ({ queuedAt: Date.now() }),
    onSuccess: (_d, comment, ctx) => {
      const queuedAt = ctx?.queuedAt ?? Date.now();
      const parentId = comment.parent_comment_id;
      const stanceField = comment.stance ? `${comment.stance}_count` : null;

      notifyManager.batch(() => {
        adjustCountInCaches(queryClient, { roots: POST_QUERY_ROOTS, id: postId, field: "comment_count", delta: -1, queuedAt });
        if (!parentId && stanceField) adjustCountInCaches(queryClient, { roots: POST_QUERY_ROOTS, id: postId, field: stanceField, delta: -1, queuedAt });
        if (parentId) {
          adjustCountInCaches(queryClient, { roots: COMMENT_QUERY_ROOTS, id: parentId, field: "reply_count", delta: -1, queuedAt });
          if (stanceField) adjustCountInCaches(queryClient, { roots: COMMENT_QUERY_ROOTS, id: parentId, field: stanceField, delta: -1, queuedAt });
        }
      });

      // The comment leaves every list it was in; its own detail query resolves to "gone".
      void queryClient.invalidateQueries({ queryKey: ["comment-list", postId] });
      void queryClient.invalidateQueries({ queryKey: ["comment", comment.id] });
    },
  });
}
