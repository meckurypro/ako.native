// src/components/comments/CommentEngagement.tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Share } from "react-native";

import { GiftPicker } from "@/components/post/GiftPicker";
import { StanceComposer } from "@/components/post/StanceComposer";
import { useAuth } from "@/hooks/useAuth";
import { useLiveThread } from "@/hooks/useLiveCounts";
import type { CommentWithAuthor } from "@/hooks/useComments";
import { useMyCommentReactions, useToggleCommentReaction, type CommentCountDeltas, type CommentReactionState } from "@/hooks/useReactions";
import { APP_URL } from "@/lib/config";
import type { Stance } from "@/types/database";
import { CommentReportSheet } from "./CommentReportSheet";

interface CommentEngagementCtx {
  postId: string;
  currentUserId: string | null;
  reactions: Map<string, CommentReactionState> | undefined;
  /** Unconfirmed taps (queued/offline included) to add to each comment's stored counts. */
  deltas: CommentCountDeltas;
  toggleReaction: (input: { commentId: string; type: "like" | "dislike"; currentlyActive: boolean }) => void;
  /** Lists tell the provider which comments are on screen so ONE batched query covers all their reactions. */
  register: (ids: string[]) => void;
  share: (comment: CommentWithAuthor) => void;
  report: (comment: CommentWithAuthor) => void;
  gift: (comment: CommentWithAuthor) => void;
  reply: (comment: CommentWithAuthor, stance?: Stance) => void;
}

const Ctx = createContext<CommentEngagementCtx | null>(null);

export function useCommentEngagement(): CommentEngagementCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCommentEngagement must be used inside <CommentEngagementProvider>");
  return ctx;
}

export function commentUrl(postId: string, commentId: string): string {
  return `${APP_URL}/post/${postId}/comment/${commentId}`;
}

/**
 * Everything a page of comments shares: the batched "which of these have I liked" query, like/dislike toggles,
 * and the sheets a comment can open (reply composer, gift, report, share). Mount once per page and give it a
 * `key` that changes with the page's subject so the id registry starts clean for each opened comment.
 */
export function CommentEngagementProvider({ postId, children }: { postId: string; children: ReactNode }) {
  const { user } = useAuth();
  // Everyone's reactions and replies in this conversation arrive live (counts roll, new replies appear).
  useLiveThread(postId);

  const knownRef = useRef<Set<string>>(new Set());
  const [knownIds, setKnownIds] = useState<string[]>([]);
  const register = useCallback((ids: string[]) => {
    let changed = false;
    for (const id of ids) {
      if (!knownRef.current.has(id)) {
        knownRef.current.add(id);
        changed = true;
      }
    }
    if (changed) setKnownIds(Array.from(knownRef.current));
  }, []);

  const { data: reactions, deltas } = useMyCommentReactions(postId, knownIds);
  const toggle = useToggleCommentReaction(postId);

  const [replyTarget, setReplyTarget] = useState<{ comment: CommentWithAuthor; stance: Stance } | null>(null);
  const [reportTarget, setReportTarget] = useState<CommentWithAuthor | null>(null);
  const [giftTarget, setGiftTarget] = useState<CommentWithAuthor | null>(null);

  const share = useCallback(
    async (comment: CommentWithAuthor) => {
      const url = commentUrl(postId, comment.id);
      try {
        await Share.share({ message: url, url });
      } catch {
        // Share sheet dismissed — nothing to do.
      }
    },
    [postId]
  );

  const value = useMemo<CommentEngagementCtx>(
    () => ({
      postId,
      currentUserId: user?.id ?? null,
      reactions,
      deltas,
      toggleReaction: toggle.mutate,
      register,
      share: (c) => void share(c),
      report: setReportTarget,
      gift: setGiftTarget,
      reply: (comment, stance = "support") => setReplyTarget({ comment, stance }),
    }),
    [postId, user?.id, reactions, deltas, toggle.mutate, register, share]
  );

  return (
    <Ctx.Provider value={value}>
      {children}

      {replyTarget ? (
        <StanceComposer postId={postId} stance={replyTarget.stance} parentCommentId={replyTarget.comment.id} onClose={() => setReplyTarget(null)} />
      ) : null}
      {reportTarget ? <CommentReportSheet comment={reportTarget} onClose={() => setReportTarget(null)} /> : null}
      {giftTarget ? (
        <GiftPicker
          recipientId={giftTarget.author.id}
          recipientName={giftTarget.author.display_name}
          recipientAvatar={giftTarget.author.avatar_url}
          postId={postId}
          commentId={giftTarget.id}
          onClose={() => setGiftTarget(null)}
        />
      ) : null}
    </Ctx.Provider>
  );
}
