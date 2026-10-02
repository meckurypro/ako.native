// src/hooks/useMessageReactions.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { DEFAULT_TOP_EMOJIS } from "../lib/emojiData";

export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

/** Reactions for every message in a conversation, keyed by message_id -> list. Kept live via Realtime. */
export function useConversationReactions(conversationId: string, messageIds: string[]) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["message-reactions", conversationId],
    queryFn: async (): Promise<Record<string, MessageReaction[]>> => {
      if (!messageIds.length) return {};
      const { data, error } = await supabase
        .from("message_reactions")
        .select("message_id, user_id, emoji")
        .in("message_id", messageIds);
      if (error) throw error;
      const grouped: Record<string, MessageReaction[]> = {};
      for (const r of data ?? []) {
        (grouped[r.message_id] ??= []).push(r);
      }
      return grouped;
    },
    enabled: messageIds.length > 0,
  });

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`message-reactions:${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["message-reactions", conversationId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return query;
}

export function useSetReaction(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const { error } = await supabase.rpc("set_message_reaction", {
        p_message_id: messageId,
        p_emoji: emoji,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-reactions", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["user-top-emojis"] });
    },
  });
}

export function useRemoveReaction(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.rpc("remove_message_reaction", { p_message_id: messageId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-reactions", conversationId] });
    },
  });
}

/**
 * The 12 emojis for the reaction pill — the user's personal most-used
 * (by use_count, tie-broken by recency), padded with defaults if they
 * haven't reacted with 12 distinct emojis yet.
 */
export function useUserTopEmojis(): string[] {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["user-top-emojis", user?.id],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("user_emoji_usage")
        .select("emoji")
        .eq("user_id", user!.id)
        .order("use_count", { ascending: false })
        .order("last_used_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []).map((r) => r.emoji);
    },
    enabled: !!user,
  });

  const tracked = data ?? [];
  const padded = [...tracked];
  for (const fallback of DEFAULT_TOP_EMOJIS) {
    if (padded.length >= 12) break;
    if (!padded.includes(fallback)) padded.push(fallback);
  }
  return padded.slice(0, 12);
}

/**
 * Up to `limit` emoji the user has actually used, most-recent-first —
 * for the full emoji picker's "Recents" section. Unlike
 * useUserTopEmojis, this is NOT padded with defaults: an empty result
 * means the section should be hidden entirely.
 */
export function useRecentEmojis(limit = 36): string[] {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["recent-emojis", user?.id, limit],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("user_emoji_usage")
        .select("emoji")
        .eq("user_id", user!.id)
        .order("last_used_at", { ascending: false })
        .order("use_count", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => r.emoji);
    },
    enabled: !!user,
  });

  return data ?? [];
}

/**
 * Records a use of `emoji` picked from the compose-bar picker, so it
 * surfaces in the picker's own "Recently used" section next time.
 * Reactions already track usage via set_message_reaction — this
 * covers the other path (typing an emoji into a message).
 */
export function useTrackEmojiUsage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (emoji: string) => {
      if (!user) return;
      const { error } = await supabase.rpc("track_emoji_usage", { p_emoji: emoji });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-emojis"] });
      queryClient.invalidateQueries({ queryKey: ["user-top-emojis"] });
    },
  });
}

export interface MessageUserState {
  message_id: string;
  starred_at: string | null;
  pinned_at: string | null;
  // Per-user, restorable — see useHiddenMessages/useSetMessagesHidden below.
  hidden_at: string | null;
  // Per-user, permanent — see useDeleteMessages in useMessaging.ts. Kept
  // here too so MessageThread can filter these out of the live thread
  // alongside hidden_at in one pass over the same userStates map.
  deleted_for_me_at: string | null;
  // Per-user, permanent — set the moment a recipient finishes playing a
  // view-once voice note (see VoiceMessageBubble). Sender's own copy
  // never sets this, so their bubble stays replayable.
  opened_once_at: string | null;
}

type UserStatePatch = Partial<
  Pick<MessageUserState, "starred_at" | "pinned_at" | "hidden_at" | "deleted_for_me_at" | "opened_once_at">
>;

/**
 * Writes one message_user_state row for (messageId, userId) — used by
 * every star/pin/hide/delete-for-me action in this file and in
 * useMessaging.ts. Deliberately a manual select-then-update-or-insert
 * instead of `.upsert(patch, { onConflict: "message_id,user_id" })`:
 * the onConflict target has to name an actual unique constraint/index
 * in the database, and if that constraint's name (or existence) ever
 * drifts from what the client assumes — same class of issue as the
 * embedded-FK bug in useMessages — the upsert fails outright and the
 * action silently does nothing. This version only relies on being
 * able to select/insert/update the table, which is far harder to break.
 */
export async function upsertMessageUserState(userId: string, messageId: string, patch: UserStatePatch) {
  const { data: existing, error: selectError } = await supabase
    .from("message_user_state")
    .select("message_id")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from("message_user_state")
      .update(patch)
      .eq("message_id", messageId)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("message_user_state")
      .insert({ message_id: messageId, user_id: userId, ...patch });
    if (error) throw error;
  }
}

export function useMessageUserStates(conversationId: string, messageIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    // messageIds is intentionally not part of the key — this query is
    // re-run (not just re-rendered) whenever the underlying set of
    // fetched messages changes, because useMessages' realtime
    // subscription already invalidates ["messages", conversationId]
    // and callers re-derive messageIds from that on every render.
    queryKey: ["message-user-state", conversationId, user?.id],
    queryFn: async (): Promise<Record<string, MessageUserState>> => {
      if (!messageIds.length || !user) return {};
      const { data, error } = await supabase
        .from("message_user_state")
        .select("message_id, starred_at, pinned_at, hidden_at, deleted_for_me_at, opened_once_at")
        .in("message_id", messageIds)
        .eq("user_id", user.id);
      if (error) throw error;
      const map: Record<string, MessageUserState> = {};
      for (const row of data ?? []) map[row.message_id] = row;
      return map;
    },
    enabled: messageIds.length > 0 && !!user,
  });
}

export function useToggleMessageState(conversationId: string, field: "starred_at" | "pinned_at" | "hidden_at") {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, active }: { messageId: string; active: boolean }) => {
      if (!user) throw new Error("Not signed in");
      await upsertMessageUserState(user.id, messageId, { [field]: active ? new Date().toISOString() : null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-user-state", conversationId] });
    },
  });
}

/**
 * Marks a view-once voice note as opened for the current user — DB-backed
 * (message_user_state.opened_once_at) rather than a local flag, so it's
 * the same "already played" fact whichever device/session reopens the
 * chat, and the sender can eventually see it was opened too. Fire-and-
 * forget from VoiceMessageBubble's onEnd: the bubble already collapses
 * to the spent placeholder optimistically, this just persists that.
 */
export function useMarkVoiceNoteOpened(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!user) throw new Error("Not signed in");
      await upsertMessageUserState(user.id, messageId, { opened_once_at: new Date().toISOString() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-user-state", conversationId] });
    },
  });
}

/**
 * Same as useToggleMessageState but for N messages — backs the "Hide"
 * bulk action in MessageSelectionBar. Always sets (never bulk-clears)
 * since bulk-hide is the only bulk entry point; restoring happens one
 * at a time from the Hidden screen. Runs one write per message rather
 * than a single batched upsert, for the same reason as
 * upsertMessageUserState above.
 */
export function useBulkSetMessagesHidden(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (!user) throw new Error("Not signed in");
      const now = new Date().toISOString();
      for (const messageId of messageIds) {
        await upsertMessageUserState(user.id, messageId, { hidden_at: now });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["message-user-state", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["hidden-messages", conversationId] });
    },
  });
}

/**
 * Every message in this conversation the current user has hidden from
 * their own view — powers the per-conversation Hidden screen. Hiding
 * never touches the other participant's copy or the global row, so this
 * is purely a message_user_state read joined against messages client-side.
 */
export function useHiddenMessages(conversationId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["hidden-messages", conversationId, user?.id],
    queryFn: async (): Promise<MessageWithSenderLite[]> => {
      if (!user) return [];
      const { data: states, error: stateError } = await supabase
        .from("message_user_state")
        .select("message_id, hidden_at")
        .eq("user_id", user.id)
        .not("hidden_at", "is", null);
      if (stateError) throw stateError;
      if (!states?.length) return [];

      const { data: messages, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at, is_deleted")
        .eq("conversation_id", conversationId)
        .in(
          "id",
          states.map((s) => s.message_id)
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return messages ?? [];
    },
    enabled: !!conversationId && !!user,
  });
}

/** Restores a single message hidden via useBulkSetMessagesHidden/useToggleMessageState. */
export function useUnhideMessage(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("message_user_state")
        .update({ hidden_at: null })
        .eq("message_id", messageId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hidden-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["message-user-state", conversationId] });
    },
  });
}

export interface MessageWithSenderLite {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_deleted: boolean;
}
