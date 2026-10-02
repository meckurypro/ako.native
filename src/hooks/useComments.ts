import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { resolveFunctionErrorMessage } from "../lib/functionErrors";
import type { Comment, Stance } from "../types/database";

export interface CommentWithAuthor extends Comment {
  author: { id: string; username: string; display_name: string; avatar_url: string | null };
}

const COMMENT_SELECT = `*, author:profiles!comments_author_id_fkey(id, username, display_name, avatar_url)`;

/**
 * Top-level (root) comments only — parent_comment_id IS NULL. Replies
 * are fetched separately, per comment, only once that specific
 * comment's thread is expanded (see useCommentReplies below). Opening
 * the sheet on a post with a huge discussion used to pull down every
 * reply at every depth just to render the top level; now it only ever
 * costs what's actually rendered.
 */
export function useRootComments(postId: string) {
  return useQuery({
    queryKey: ["comments", postId],
    queryFn: async (): Promise<CommentWithAuthor[]> => {
      const { data, error } = await supabase
        .from("comments")
        .select(COMMENT_SELECT)
        .eq("post_id", postId)
        .is("parent_comment_id", null)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as unknown as CommentWithAuthor[];
    },
    enabled: !!postId,
  });
}

/**
 * A single comment's IMMEDIATE replies only — never its replies'
 * replies. `enabled` is driven by whether that comment's thread is
 * currently expanded in the UI (see CommentThread in CommentSheet.tsx),
 * so a node with 50 replies-of-replies costs nothing until each of
 * those 50 is individually opened. Each rendered reply gets its own
 * call of this same hook (keyed off its own id) for its own children —
 * the thread is walked one level at a time, comment-specific, rather
 * than the whole subtree arriving in one shot.
 */
export function useCommentReplies(postId: string, parentCommentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["comment-replies", postId, parentCommentId],
    queryFn: async (): Promise<CommentWithAuthor[]> => {
      const { data, error } = await supabase
        .from("comments")
        .select(COMMENT_SELECT)
        .eq("post_id", postId)
        .eq("parent_comment_id", parentCommentId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as unknown as CommentWithAuthor[];
    },
    enabled: enabled && !!parentCommentId,
  });
}

/**
 * Walks a single comment's ancestor chain (immediate parent, then its
 * parent, and so on up to the root) by id — one lightweight
 * row-per-hop lookup rather than pulling the whole tree just to find
 * a lineage. Used only to auto-expand the right nested threads when
 * arriving via a notification link that points at a reply buried a
 * few levels down (see highlightId in CommentSheet.tsx). Returns ids
 * ordered root-first, immediate-parent-last.
 */
export function useCommentAncestors(commentId: string | null | undefined) {
  return useQuery({
    queryKey: ["comment-ancestors", commentId],
    queryFn: async (): Promise<string[]> => {
      const chain: string[] = [];
      let currentId = commentId!;
      // Bounded to be safe against any unexpected cyclical data —
      // threads don't realistically nest this deep.
      for (let i = 0; i < 50; i++) {
        const { data, error } = await supabase
          .from("comments")
          .select("id, parent_comment_id")
          .eq("id", currentId)
          .maybeSingle();
        if (error || !data?.parent_comment_id) break;
        chain.push(data.parent_comment_id);
        currentId = data.parent_comment_id;
      }
      return chain.reverse(); // root-first
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

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: CreateCommentInput) => {
      const { data, error } = await supabase.functions.invoke("create-comment", {
        body: input,
      });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", postId] });
      // Prefix match — refreshes every currently-open reply thread for
      // this post (["comment-replies", postId, <any parent>]) so a new
      // reply shows up immediately in whichever panel it landed in,
      // without eagerly touching threads nobody has expanded.
      queryClient.invalidateQueries({ queryKey: ["comment-replies", postId] });
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });
}
