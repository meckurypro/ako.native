// src/hooks/useMessaging.ts
import { randomUUID } from "expo-crypto";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { notifyMessagePush } from "../lib/pushNotify";
import { useAuth } from "./useAuth";
import { useSound } from "./useSound";
import { CHAT_MEDIA_BUCKET, chatFileName, decodeMedia, encodeMedia, safeStorageName } from "../lib/chatMedia";
import { decodeVoiceNote, encodeVoiceNote } from "../lib/voiceNotes";
import { upsertMessageUserState } from "./useMessageReactions";
import { fileExtension, type LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";

export interface ConversationSummary {
  id: string;
  last_message_at: string;
  pinned_at: string | null;
  archived_at: string | null;
  // True for a page's team chat (see team_group_chat_migration.sql).
  // Nothing else sets is_group today — team chats are the only kind
  // of group conversation this covers.
  is_group: boolean;
  // Populated only when is_group — this is what the list/header show
  // instead of other_participant: the page's own name/avatar/type,
  // not a mashup of member names. Null for an ordinary 1:1.
  team_page: {
    id: string;
    username: string;
    name: string;
    avatar_url: string | null;
    page_type: "organization" | "brand";
    is_verified: boolean;
  } | null;
  // For a group conversation this still resolves to SOME other
  // member (whichever the batched lookup below happens to keep) —
  // callers that care about groups should check is_group/team_page
  // first and only fall back to this for the 1:1 case.
  other_participant: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    last_seen_at: string | null;
  };
  last_message: {
    content: string;
    sender_id: string;
    delivered_at: string | null;
    read_at: string | null;
    // True when this preview is a tombstone ("deleted for everyone") —
    // list/archive rows should render the "message was deleted" label
    // instead of `content` in that case (content is kept for callers
    // that don't care, same as the thread view).
    is_deleted: boolean;
  } | null;
  unread: boolean;
  /** Number of messages from the other participant since we last read
   *  the thread — powers the numeric badge in the chat list. */
  unreadCount: number;
}

/** Shape shared by the per-conversation "last message" preview, how-
 *  ever it's fetched. */
interface LastMessagePreview {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  is_deleted: boolean;
}

/**
 * Batched replacement for what used to be a per-conversation
 * getVisibleLastMessage() call — that version did 2 round trips PER
 * conversation (1 sequential `await` in a `for` loop each), so a user
 * with 30 conversations cost 60 sequential network round trips just to
 * render the list. This does the same job — most recent message per
 * conversation, skipping anything the user has hidden/deleted for
 * themselves, but keeping tombstones ("deleted for everyone") since
 * those still occupy a slot — in exactly 2 round trips TOTAL,
 * regardless of how many conversations are passed in.
 *
 * Trade-off: it pulls one shared window of the most recent messages
 * across ALL the given conversations (capped, sized to roughly 8 per
 * conversation) rather than looking back individually per
 * conversation. If one conversation in the batch is extremely chatty
 * it could — in theory — push a quiet conversation's true last message
 * outside that window, showing a slightly stale preview for it. That
 * only matters for a handful of edge-case rows out of what's normally
 * dozens of conversations, and is a trade worth making for turning N
 * sequential round trips into a fixed 2.
 */
async function batchGetVisibleLastMessages(
  conversationIds: string[],
  userId: string
): Promise<Map<string, LastMessagePreview>> {
  const result = new Map<string, LastMessagePreview>();
  if (!conversationIds.length) return result;

  const windowLimit = Math.min(Math.max(conversationIds.length * 8, 50), 1000);
  const { data: recent, error } = await supabase
    .from("messages")
    .select("id, conversation_id, content, sender_id, created_at, delivered_at, read_at, is_deleted")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })
    .limit(windowLimit);
  if (error || !recent?.length) return result;

  const { data: states } = await supabase
    .from("message_user_state")
    .select("message_id, hidden_at, deleted_for_me_at")
    .eq("user_id", userId)
    .in(
      "message_id",
      recent.map((m) => m.id)
    );
  const excluded = new Set((states ?? []).filter((s) => s.hidden_at || s.deleted_for_me_at).map((s) => s.message_id));

  // `recent` is already ordered newest-first, so the first non-excluded
  // hit per conversation_id is that conversation's most recent visible
  // message.
  for (const m of recent) {
    if (excluded.has(m.id)) continue;
    if (!result.has(m.conversation_id)) result.set(m.conversation_id, m);
  }
  return result;
}

/**
 * Fetching a message into this user's inbox is itself proof of
 * delivery. delivered_at otherwise only ever gets stamped by
 * useGlobalMessageDelivery's live Realtime listener below, which
 * requires that listener to have been subscribed at the exact instant
 * the message was inserted — a recipient who wasn't connected right
 * then (tab opened afterward, dropped socket, cold load) would
 * otherwise leave the sender stuck on a single tick forever, even
 * though the message is sitting right there in the recipient's list.
 * Called from both useConversations and useArchivedConversations,
 * which between the 15s poll and mount-time fetch means this closes
 * the gap within a few seconds even when the live event was missed.
 */
async function backfillDelivered(messageIds: string[]) {
  if (!messageIds.length) return;
  const { error } = await supabase
    .from("messages")
    .update({ delivered_at: new Date().toISOString() })
    .in("id", messageIds)
    .is("delivered_at", null);
  if (error) console.error("Failed to backfill delivered_at:", error);
}

/**
 * Batched replacement for what used to be a per-conversation
 * getUnreadCount() `SELECT COUNT` — another sequential round trip per
 * conversation. Each conversation has its own "unread since" cutoff
 * (last_read_at), so this can't be a single grouped SQL count via
 * PostgREST; instead it pulls incoming (not-mine) messages across every
 * conversation in ONE query and counts client-side against each
 * conversation's own cutoff from `readMap`.
 *
 * Trade-off: capped like the function above. An unread backlog deeper
 * than the cap (thousands of messages since last read in one thread)
 * would undercount — an acceptable trade for 1 round trip instead of N.
 */
async function batchGetUnreadCounts(
  conversationIds: string[],
  userId: string,
  readMap: Map<string, string | null>
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!conversationIds.length) return counts;

  const { data, error } = await supabase
    .from("messages")
    .select("conversation_id, sender_id, created_at")
    .in("conversation_id", conversationIds)
    .neq("sender_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(conversationIds.length * 20, 100), 5000));
  if (error || !data) return counts;

  for (const row of data) {
    const lastReadAt = readMap.get(row.conversation_id);
    if (lastReadAt && row.created_at <= lastReadAt) continue;
    counts.set(row.conversation_id, (counts.get(row.conversation_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Batched replacement for what used to be a per-conversation
 * "other participant" lookup — 1 more sequential round trip per
 * conversation. Fetches every conversation's other-participant profile
 * in a single query instead.
 */
async function batchGetOtherParticipants(
  conversationIds: string[],
  userId: string
): Promise<Map<string, ConversationSummary["other_participant"]>> {
  const map = new Map<string, ConversationSummary["other_participant"]>();
  if (!conversationIds.length) return map;

  const { data, error } = await supabase
    .from("conversation_participants")
    .select(
      "conversation_id, profile:profiles!conversation_participants_user_id_fkey(id, username, display_name, avatar_url, last_seen_at)"
    )
    .in("conversation_id", conversationIds)
    .neq("user_id", userId);
  if (error || !data) return map;

  for (const row of data) {
    if (row.profile) map.set(row.conversation_id, row.profile as unknown as ConversationSummary["other_participant"]);
  }
  return map;
}

/**
 * Lists the current user's conversations, newest first, with enough
 * info to render a conversation list item without extra per-row fetches.
 */
export function useConversations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async (): Promise<ConversationSummary[]> => {
      const { data: myParticipation, error } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at, archived_at, pinned_at, hidden_at, left_at")
        .eq("user_id", user!.id);

      if (error) throw error;
      if (!myParticipation?.length) return [];

      // "Deleted" chats are hidden for this user only. Archived chats
      // (manual archives, and pending message requests from people who
      // don't follow the user back — see is_request) are also kept out
      // of the main list here; see useArchivedConversations for the
      // Archive screen that surfaces them.
      const visible = myParticipation.filter((p) => !p.hidden_at && !p.archived_at);
      if (!visible.length) return [];

      const conversationIds = visible.map((p) => p.conversation_id);
      const readMap = new Map(visible.map((p) => [p.conversation_id, p.last_read_at]));
      const pinMap = new Map(visible.map((p) => [p.conversation_id, p.pinned_at]));
      // Set once someone's removed from a team they were active on (see
      // team_group_chat_migration.sql) — they keep the thread as
      // history but stop generating unread badges/notifications for it,
      // same as a muted/archived chat would, without actually hiding it
      // from the list the way archived_at does.
      const leftMap = new Map(visible.map((p) => [p.conversation_id, !!p.left_at]));

      const { data: conversations, error: convError } = await supabase
        .from("conversations")
        .select(
          "id, last_message_at, is_group, team_page:pages!conversations_team_page_id_fkey(id, username, name, avatar_url, page_type, is_verified)"
        )
        .in("id", conversationIds)
        .order("last_message_at", { ascending: false });

      if (convError) throw convError;
      if (!conversations?.length) return [];

      // These three used to be up to 4 sequential round trips PER
      // conversation (other-participant lookup, last-message lookup,
      // unread count). Now it's a fixed 4 round trips TOTAL, run in
      // parallel, regardless of how many conversations the user has.
      const [otherParticipants, lastMessages, unreadCounts] = await Promise.all([
        batchGetOtherParticipants(conversationIds, user!.id),
        batchGetVisibleLastMessages(conversationIds, user!.id),
        batchGetUnreadCounts(conversationIds, user!.id, readMap),
      ]);

      const results: ConversationSummary[] = [];
      const undeliveredIds: string[] = [];

      for (const conv of conversations) {
        const otherParticipant = otherParticipants.get(conv.id);
        // A 1:1 row with no resolvable other participant is broken
        // data — skip it as before. A group conversation always has
        // its own identity via team_page regardless of whether
        // batchGetOtherParticipants found anyone (it will, but
        // shouldn't be load-bearing for groups).
        if (!conv.is_group && !otherParticipant) continue;

        const lastMessage = lastMessages.get(conv.id) ?? null;
        if (lastMessage && lastMessage.sender_id !== user!.id && !lastMessage.delivered_at) {
          undeliveredIds.push(lastMessage.id);
        }

        // Our own sent messages must never flip a conversation back to
        // unread — batchGetUnreadCounts already only counts the OTHER
        // participant's messages, so "unread" falls straight out of it.
        // A conversation left via left_at never contributes a badge,
        // regardless of what's actually unread in it.
        const unreadCount = leftMap.get(conv.id) ? 0 : unreadCounts.get(conv.id) ?? 0;

        results.push({
          id: conv.id,
          last_message_at: conv.last_message_at,
          pinned_at: pinMap.get(conv.id) ?? null,
          archived_at: null, // archived ones are already filtered out above
          is_group: conv.is_group,
          team_page: (conv as any).team_page ?? null,
          other_participant: otherParticipant!,
          last_message: lastMessage
            ? {
                content: lastMessage.content,
                sender_id: lastMessage.sender_id,
                delivered_at: lastMessage.delivered_at,
                read_at: lastMessage.read_at,
                is_deleted: lastMessage.is_deleted,
              }
            : null,
          unread: unreadCount > 0,
          unreadCount,
        });
      }

      await backfillDelivered(undeliveredIds);

      // Pinned conversations float to the top; recency order (already
      // applied by the query above) is preserved within each group
      // since Array.sort is stable.
      results.sort((a, b) => (b.pinned_at ? 1 : 0) - (a.pinned_at ? 1 : 0));

      return results;
    },
    enabled: !!user,
    refetchInterval: 15_000, // simple polling fallback alongside the realtime subscription in useMessages
  });
}

export interface MessageWithSender {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  reply_to_message_id: string | null;
  // "Deleted for everyone" — the row stays in the thread for BOTH
  // participants but renders as a tombstone ("This message was
  // deleted") instead of its content. Set only by the sender (see
  // useDeleteMessage's "everyone" scope). Distinct from a message being
  // hidden or deleted-for-me, which are per-user and filtered out of
  // this list entirely client-side (see MessageThread's use of
  // useMessageUserStates' hidden_at/deleted_for_me_at).
  is_deleted: boolean;
  // Snippet of the message being replied to, if any. Kept as an array
  // (read via reply_to?.[0]) for backward compatibility with how
  // Supabase used to return the embedded self-join — now populated by
  // a separate lookup instead (see useMessages below).
  reply_to: { id: string; content: string; sender_id: string; is_deleted: boolean }[] | null;
  // Stable identity across the optimistic-send → real-row swap below.
  // The optimistic row is keyed by a client-generated tempId; once the
  // insert succeeds, `id` changes to the real row's id but `client_key`
  // is carried forward as the same tempId — so anything keying off
  // `client_key` (React's list `key`, MessageBubble's entrance-animation
  // tracking in MessageThread) sees one continuous message, not a
  // remove+add, and never replays the entrance animation for a message
  // that's just getting its real id filled in. Absent on rows that were
  // never optimistic (plain server fetches), where `id` alone is stable.
  client_key?: string;
}

/** How many messages a single "page" covers, both for the initial load
 *  and each subsequent loadOlder() call. */
const MESSAGES_PAGE_SIZE = 30;

/**
 * Fetches message history and subscribes to new messages via
 * Supabase Realtime, so an open conversation updates live without
 * polling. Falls back gracefully if Realtime isn't enabled on the
 * project — the initial fetch still works either way.
 *
 * Deliberately does NOT filter out is_deleted rows anymore — a message
 * deleted "for everyone" must still occupy its slot in the thread as a
 * tombstone for both participants (see MessageWithSender.is_deleted).
 * Messages hidden or deleted-for-me are per-user and filtered out by
 * the caller (MessageThread) using useMessageUserStates, not here.
 *
 * PAGINATED: only fetches the most recent `pageCount * MESSAGES_PAGE_SIZE`
 * messages, not the entire thread. This used to be a plain unbounded
 * `.select()` with no `.limit()` at all — meaning EVERY realtime event
 * and every mutation's cache invalidation re-fetched the whole
 * conversation history from scratch, which only got slower the longer
 * a conversation ran. Call the returned `loadOlder()` (e.g. on scroll
 * near the top of the list) to widen the window one page at a time;
 * `placeholderData: keepPreviousData` keeps the already-loaded messages
 * on screen while a wider page loads, so widening never flashes an
 * empty/loading state.
 */
export function useMessages(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pageCount, setPageCount] = useState(1);
  const { play } = useSound();

  // A different conversation should start back at the most recent
  // page, not carry over how far a previous, longer-scrolled thread
  // had paged back.
  useEffect(() => {
    setPageCount(1);
  }, [conversationId]);

  const limit = MESSAGES_PAGE_SIZE * pageCount;

  const query = useQuery({
    queryKey: ["messages", conversationId, limit],
    queryFn: async (): Promise<MessageWithSender[]> => {
      // Deliberately a plain select with NO embedded reply_to join here.
      // An embedded self-join (`messages!<fkey-name>(...)`) depends on
      // that exact FK constraint name existing in the DB — if it's ever
      // renamed/auto-suffixed (e.g. by a dashboard migration), PostgREST
      // rejects the whole query and the thread silently renders empty
      // ("Say hello.") even though the messages exist (this happened).
      // Fetching the base rows and reply snippets as two independent
      // queries means a reply-preview issue can never blank the thread.
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, content, created_at, delivered_at, read_at, reply_to_message_id, is_deleted"
        )
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;

      const rows = (data ?? []).slice().reverse(); // back to ascending for render
      const replyIds = [...new Set(rows.map((m) => m.reply_to_message_id).filter((id): id is string => !!id))];

      let replyMap = new Map<string, { id: string; content: string; sender_id: string; is_deleted: boolean }>();
      if (replyIds.length) {
        const { data: replies, error: replyError } = await supabase
          .from("messages")
          .select("id, content, sender_id, is_deleted")
          .in("id", replyIds);
        // A failure here shouldn't blank the thread either — replies
        // just render without their quoted snippet.
        if (replyError) console.error("Failed to load reply snippets:", replyError);
        replyMap = new Map((replies ?? []).map((r) => [r.id, r]));
      }

      return rows.map((m) => ({
        ...m,
        reply_to: m.reply_to_message_id && replyMap.has(m.reply_to_message_id) ? [replyMap.get(m.reply_to_message_id)!] : null,
      })) as unknown as MessageWithSender[];
    },
    enabled: !!conversationId,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          // exact: false invalidates every paged variant of this
          // conversation's messages query (all `limit` values), not
          // just whichever page happens to be mounted right now.
          queryClient.invalidateQueries({ queryKey: ["messages", conversationId], exact: false });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });

          // Only the other participant's messages get a sound — our own
          // send already played "message-sent" via useSendMessage, and
          // this INSERT event fires for that same row too (echoed back).
          const senderId = (payload.new as { sender_id?: string } | null)?.sender_id;
          if (senderId && senderId !== user?.id) play("message-received");
        }
      )
      .on(
        // Ticks update live for the SENDER when the recipient's client
        // stamps delivered_at/read_at (see useGlobalMessageDelivery and
        // useMarkMessagesRead below) — without this, the sender would
        // only see their own tick state change on next poll/refetch.
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["messages", conversationId], exact: false });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, user?.id, play]);

  const hasMore = (query.data?.length ?? 0) >= limit;
  const loadOlder = useCallback(() => {
    setPageCount((p) => p + 1);
  }, []);

  return {
    ...query,
    hasMore,
    loadOlder,
    // True only while widening the window for older messages — NOT
    // true on the very first load (that's plain `isLoading`), so the
    // caller can show a small inline spinner up top instead of
    // replacing the whole thread with a loading state.
    isLoadingOlder: query.isFetching && pageCount > 1,
  };
}

/** Minimal reply-target shape the caller already has in hand (the full
 *  MessageWithSender they're replying to) — passed through so the
 *  optimistic bubble can render its reply-quote immediately instead of
 *  waiting on a round trip to look the snippet back up. */
interface ReplySnippetInput {
  id: string;
  content: string;
  sender_id: string;
  is_deleted: boolean;
}

interface SendMessageInput {
  content: string;
  replyToMessageId?: string | null;
  replyToSnippet?: ReplySnippetInput | null;
}

/** Every cached page of a conversation's messages, across every
 *  loaded `limit` variant — used by the optimistic-update helpers
 *  below so a sent message shows up regardless of which page window
 *  is currently mounted. */
export function getMessagesQueries(queryClient: ReturnType<typeof useQueryClient>, conversationId: string) {
  return queryClient.getQueriesData<MessageWithSender[]>({ queryKey: ["messages", conversationId], exact: false });
}

export function useSendMessage(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { play } = useSound();

  return useMutation({
    mutationFn: async (input: string | SendMessageInput) => {
      if (!user) throw new Error("Not signed in");
      const content = typeof input === "string" ? input : input.content;
      const replyToMessageId = typeof input === "string" ? null : input.replyToMessageId ?? null;

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content,
          reply_to_message_id: replyToMessageId,
        })
        .select("id, conversation_id, sender_id, content, created_at, delivered_at, read_at, reply_to_message_id, is_deleted")
        .single();
      if (error) throw error;
      notifyMessagePush(data.id);

      // Replying accepts a pending message request — moves this
      // conversation out of MY Archive. No-ops for a normal chat, and
      // for the original request sender's own copy (never flagged
      // is_request to begin with, since only the recipient's row is).
      const { error: acceptError } = await supabase
        .from("conversation_participants")
        .update({ is_request: false, archived_at: null })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .eq("is_request", true);
      if (acceptError) console.error("Failed to accept message request:", acceptError);

      return data;
    },
    // Optimistic send: the bubble appears the instant you hit send,
    // not after a full round trip + a full thread refetch. This used
    // to be the single biggest source of "sending feels slow" — the
    // old version had NO optimistic update at all, just an insert
    // followed by invalidating (and thus fully re-fetching) the whole
    // messages query, AND the realtime INSERT subscription in
    // useMessages independently invalidated the same query again —
    // two full refetches, in sequence, before your own message ever
    // showed up.
    onMutate: async (input) => {
      const content = typeof input === "string" ? input : input.content;
      const replyToMessageId = typeof input === "string" ? null : input.replyToMessageId ?? null;
      const replyToSnippet = typeof input === "string" ? null : input.replyToSnippet ?? null;

      await queryClient.cancelQueries({ queryKey: ["messages", conversationId], exact: false });

      const previousQueries = getMessagesQueries(queryClient, conversationId);
      const tempId = randomUUID();
      const optimisticMessage: MessageWithSender = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user!.id,
        content,
        created_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        reply_to_message_id: replyToMessageId,
        is_deleted: false,
        reply_to: replyToSnippet ? [replyToSnippet] : null,
        client_key: tempId,
      };

      for (const [key, existing] of previousQueries) {
        queryClient.setQueryData(key, [...(existing ?? []), optimisticMessage]);
      }

      return { previousQueries, tempId };
    },
    onError: (_err, _input, context) => {
      if (!context) return;
      for (const [key, data] of context.previousQueries) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess: (data, _input, context) => {
      // Swap the optimistic temp-id message for the real row now that
      // we have it — no need to wait for the realtime INSERT event
      // (which will also arrive and no-op against an already-correct
      // cache) or to invalidate/re-fetch the whole page again.
      // client_key carries the original tempId forward (see
      // MessageWithSender) so this swap doesn't read as a new message
      // to anything keying off it, e.g. MessageThread's entrance
      // animation.
      if (context) {
        for (const [key, existing] of getMessagesQueries(queryClient, conversationId)) {
          if (!existing) continue;
          queryClient.setQueryData(
            key,
            existing.map((m) =>
              m.id === context.tempId
                ? { ...(data as MessageWithSender), reply_to: m.reply_to, client_key: context.tempId }
                : m
            )
          );
        }
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["archived-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["my-participant-state", conversationId] });
      play("message-sent");
    },
  });
}

/**
 * Records + uploads a voice note and sends it as a message. Rides the
 * existing text-only `messages.content` column via encodeVoiceNote
 * (see lib/voiceNotes.ts) rather than needing a schema change.
 *
 * Uses the dedicated "audio" storage bucket, with the path's first
 * folder segment set to the uploader's own `user.id`. That isn't
 * cosmetic: the bucket's INSERT policy ("Users can upload audio to
 * their own folder") checks `storage.foldername(name)[1] = auth.uid()`,
 * so the path shape here has to match it exactly or every upload is
 * rejected by RLS before it ever reaches storage. (An earlier version
 * of this path put the conversation id first and used the post-media
 * bucket, which doesn't satisfy that check — voice notes were failing
 * to upload for every sender because of it.)
 */
interface SendVoiceNoteInput {
  /** The recorded audio file (local URI from useVoiceRecorder). */
  file: LocalFile;
  durationSec: number;
  peaks?: number[];
  viewOnce?: boolean;
  replyToMessageId?: string | null;
  replyToSnippet?: ReplySnippetInput | null;
  /** The recorder's own local file URI (still valid at send time — see
   *  useVoiceRecorder.sendPreview, which only deletes the file after
   *  this mutation resolves). Lets the bubble appear and be
   *  playable INSTANTLY, before the upload to storage has even
   *  finished, instead of waiting on the upload + insert round trip. */
  localUrl?: string;
}

export function useSendVoiceNote(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, durationSec, peaks, viewOnce, replyToMessageId }: SendVoiceNoteInput) => {
      if (!user) throw new Error("Not signed in");

      const ext = fileExtension(file);
      // First segment MUST be the uploader's own auth.uid() — see the
      // storage RLS note above. Segment 2 ("dm") + the conversation id
      // are what the private bucket's SELECT policy checks to decide
      // whether the OTHER participant (not the uploader) can read this
      // file back — see the private_audio_bucket_with_participant_
      // read_rls migration.
      const path = `${user.id}/dm/${conversationId}/${Date.now()}-${chatFileName("PTT", ext)}`;
      await uploadLocalFile("audio", path, file);

      // Stores the PATH, not a URL — the bucket is private, so there's
      // no public URL to store, and a signed one would just expire
      // sitting in the message. VoiceMessageBubble resolves a fresh
      // signed URL from this path at render time instead (see
      // lib/signedAudioUrl.ts).
      const content = encodeVoiceNote({ path, durationSec, peaks, viewOnce });

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content,
          reply_to_message_id: replyToMessageId ?? null,
        })
        .select("id, conversation_id, sender_id, content, created_at, delivered_at, read_at, reply_to_message_id, is_deleted")
        .single();
      if (error) throw error;
      notifyMessagePush(data.id);

      // Mirrors useSendMessage's request-accept side effect — a voice
      // note reply should move a pending request out of Archive too.
      const { error: acceptError } = await supabase
        .from("conversation_participants")
        .update({ is_request: false, archived_at: null })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .eq("is_request", true);
      if (acceptError) console.error("Failed to accept message request:", acceptError);

      return data;
    },
    // Same optimistic-insert approach as useSendMessage above — see
    // that hook's comment for the full reasoning. Here the optimistic
    // bubble's audio URL is the recorder's own local blob URL
    // (`localUrl`), so voice playback works immediately even though
    // the real storage upload is still in flight in the background.
    onMutate: async ({ durationSec, peaks, viewOnce, replyToMessageId, replyToSnippet, localUrl }) => {
      await queryClient.cancelQueries({ queryKey: ["messages", conversationId], exact: false });

      const previousQueries = getMessagesQueries(queryClient, conversationId);
      const tempId = randomUUID();

      // No local preview URL to show yet (shouldn't normally happen —
      // see useVoiceRecorder) — skip the optimistic bubble rather than
      // show one with no playable audio; the real message still
      // arrives normally once the upload finishes.
      if (!localUrl) return { previousQueries, tempId: null };

      const optimisticMessage: MessageWithSender = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user!.id,
        content: encodeVoiceNote({ url: localUrl, durationSec, peaks, viewOnce }),
        created_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        reply_to_message_id: replyToMessageId ?? null,
        is_deleted: false,
        reply_to: replyToSnippet ? [replyToSnippet] : null,
        client_key: tempId,
      };

      for (const [key, existing] of previousQueries) {
        queryClient.setQueryData(key, [...(existing ?? []), optimisticMessage]);
      }

      return { previousQueries, tempId };
    },
    onError: (_err, _input, context) => {
      if (!context) return;
      for (const [key, data] of context.previousQueries) {
        queryClient.setQueryData(key, data);
      }
    },
    onSuccess: (data, _input, context) => {
      if (context?.tempId) {
        for (const [key, existing] of getMessagesQueries(queryClient, conversationId)) {
          if (!existing) continue;
          queryClient.setQueryData(
            key,
            existing.map((m) =>
              m.id === context.tempId
                ? { ...(data as MessageWithSender), reply_to: m.reply_to, client_key: context.tempId }
                : m
            )
          );
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId], exact: false });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["archived-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["my-participant-state", conversationId] });
    },
  });
}

export type DeleteScope = "me" | "everyone";

/**
 * Deletes one message in one of two scopes:
 *  - "everyone": flips messages.is_deleted (mirrors posts/comments'
 *    soft-delete pattern). RLS should restrict this to
 *    sender_id = auth.uid() at the database level — not re-checked
 *    client-side here, and callers must not offer this scope for a
 *    message that isn't the current user's own.
 *  - "me": stamps message_user_state.deleted_for_me_at for the current
 *    user only. Permanent (no restore, unlike hidden_at) and works on
 *    ANY message regardless of sender — including a tombstone already
 *    deleted "for everyone", which is how a user clears a tombstone out
 *    of their own view after the fact.
 */
export function useDeleteMessage(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, scope }: { messageId: string; scope: DeleteScope }) => {
      if (scope === "everyone") {
        const { error } = await supabase.from("messages").update({ is_deleted: true }).eq("id", messageId);
        if (error) throw error;
        return;
      }
      if (!user) throw new Error("Not signed in");
      await upsertMessageUserState(user.id, messageId, { deleted_for_me_at: new Date().toISOString() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["message-user-state", conversationId] });
    },
  });
}

/** Bulk version of useDeleteMessage — backs the multi-select delete action. */
export function useBulkDeleteMessages(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageIds, scope }: { messageIds: string[]; scope: DeleteScope }) => {
      if (!messageIds.length) return;
      if (scope === "everyone") {
        const { error } = await supabase.from("messages").update({ is_deleted: true }).in("id", messageIds);
        if (error) throw error;
        return;
      }
      if (!user) throw new Error("Not signed in");
      const now = new Date().toISOString();
      for (const messageId of messageIds) {
        await upsertMessageUserState(user.id, messageId, { deleted_for_me_at: now });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["message-user-state", conversationId] });
    },
  });
}

/**
 * Re-homes a message's stored files (chat photos/documents, voice messages) into the target
 * conversation's folder so the new recipient can read them. Text passes through untouched.
 * A failed media copy throws (the forward shouldn't silently send a broken photo); a failed
 * voice copy falls back to the original content, which is what forwarding did before.
 */
async function contentForConversation(content: string, targetConversationId: string, userId: string): Promise<string> {
  const media = decodeMedia(content);
  if (media) {
    const items = await Promise.all(
      media.items.map(async (item, i) => {
        if (!item.path) return item;
        const dest = `${userId}/dm/${targetConversationId}/${Date.now()}-${i}-${safeStorageName(item.name)}`;
        const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).copy(item.path, dest);
        if (error) throw error;
        return { ...item, path: dest };
      })
    );
    return encodeMedia({ ...media, items });
  }

  const voice = decodeVoiceNote(content);
  if (voice?.path && !voice.viewOnce) {
    const dest = `${userId}/dm/${targetConversationId}/${Date.now()}-${voice.path.split("/").pop() ?? "voice.m4a"}`;
    const { error } = await supabase.storage.from("audio").copy(voice.path, dest);
    if (!error) return encodeVoiceNote({ ...voice, path: dest });
  }
  return content;
}

/**
 * Forwards one or more messages' content into one or more OTHER
 * conversations, as brand-new messages sent by the current user right
 * now — this is the in-app "share to another user" path (as opposed to
 * MessageActionMenu's onShare, which hands content to the OS share
 * sheet / clipboard for outside the app). Deliberately plain inserts,
 * same shape as useSendMessage, with no reply_to_message_id: a forwarded
 * message isn't a reply, and the source message may not even belong to
 * the target conversation.
 */
export function useForwardMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messages,
      targetConversationIds,
    }: {
      messages: { content: string }[];
      targetConversationIds: string[];
    }) => {
      if (!user) throw new Error("Not signed in");
      if (!messages.length || !targetConversationIds.length) return;

      // Photos, documents and voice messages live in storage under the ORIGINAL conversation's
      // folder, which the new recipient can't read — so each forward copies the files into the
      // target conversation's own folder and points the forwarded message at the copies.
      const rows = (
        await Promise.all(
          targetConversationIds.map((conversation_id) =>
            Promise.all(
              messages.map(async (m) => ({
                conversation_id,
                sender_id: user.id,
                content: await contentForConversation(m.content, conversation_id, user.id),
              }))
            )
          )
        )
      ).flat();
      const { data: inserted, error } = await supabase.from("messages").insert(rows).select("id");
      if (error) throw error;
      for (const row of inserted ?? []) notifyMessagePush(row.id);

      // Forwarding into a conversation that was a pending request (rare,
      // but possible if forwarding into an old thread) should accept it
      // the same way a normal reply does — mirrors useSendMessage.
      const { error: acceptError } = await supabase
        .from("conversation_participants")
        .update({ is_request: false, archived_at: null })
        .eq("user_id", user.id)
        .in("conversation_id", targetConversationIds)
        .eq("is_request", true);
      if (acceptError) console.error("Failed to accept message request while forwarding:", acceptError);
    },
    onSuccess: (_data, variables) => {
      for (const id of variables.targetConversationIds) {
        queryClient.invalidateQueries({ queryKey: ["messages", id] });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["archived-conversations"] });
    },
  });
}

/**
 * Marks all not-yet-read messages from the OTHER participant as read.
 * Call this from the thread page whenever it's mounted/visible and
 * `messages` has loaded — safe to call on every render of that effect,
 * since it only ever touches rows that still have `read_at IS NULL`.
 *
 * Reading implies delivered, so this intentionally doesn't separately
 * backfill delivered_at — MessageStatusTicks treats a present read_at
 * as sufficient on its own (see components/MessageStatusTicks.tsx).
 */
export function useMarkMessagesRead(conversationId: string, messages: MessageWithSender[] | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId || !user || !messages?.length) return;

    const unreadIds = messages.filter((m) => m.sender_id !== user.id && !m.read_at).map((m) => m.id);
    if (!unreadIds.length) return;

    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .is("read_at", null)
      .then(({ error }) => {
        if (error) {
          console.error("Failed to mark messages as read:", error);
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      });
  }, [conversationId, user, messages, queryClient]);
}

/**
 * App-wide delivery tracker. As soon as a message lands via Realtime
 * for ANY conversation this user is part of, stamps delivered_at
 * immediately — this is what makes the grey double-tick appear even
 * before the recipient has opened that specific thread, the same way
 * WhatsApp's single-tick-to-double-tick transition doesn't require you
 * to open the chat.
 *
 * Mount this once near the app root (see components/MessagingPresence.tsx)
 * — do not call it per-conversation, or you'll get duplicate subscriptions.
 */
export function useGlobalMessageDelivery() {
  const { user } = useAuth();

  const { data: conversationIds } = useQuery({
    queryKey: ["my-conversation-ids", user?.id],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.conversation_id);
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!user || !conversationIds?.length) return;

    const channel = supabase
      .channel(`message-delivery:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=in.(${conversationIds.join(",")})`,
        },
        (payload) => {
          const message = payload.new as { id: string; sender_id: string };
          if (message.sender_id === user.id) return; // never mark our own messages "delivered"

          supabase
            .from("messages")
            .update({ delivered_at: new Date().toISOString() })
            .eq("id", message.id)
            .is("delivered_at", null)
            .then(({ error }) => {
              if (error) console.error("Failed to mark message delivered:", error);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // Re-subscribes when the user's conversation list changes (e.g. a
    // new DM thread is started) so new conversations get delivery
    // tracking too, without needing a page reload.
  }, [user, conversationIds]);
}

export function useMarkConversationRead(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export interface ConversationStateUpdate {
  conversationId: string;
  pinned_at?: string | null;
  archived_at?: string | null;
  hidden_at?: string | null;
}

/**
 * Pin, archive, or hide ("delete") a conversation — all per-user:
 * this only touches the current user's own conversation_participants
 * row, so it never affects what the other side of the chat sees.
 */
export function useUpdateConversationState() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, ...updates }: ConversationStateUpdate) => {
      if (!user) return;
      const { error } = await supabase
        .from("conversation_participants")
        .update(updates)
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

/**
 * Bulk version of useUpdateConversationState — backs multi-select
 * archive/delete/unarchive on both ConversationList and Archive. Same
 * per-user semantics: only ever touches the
 * current user's own conversation_participants rows.
 */
export function useBulkUpdateConversationState() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationIds,
      ...updates
    }: {
      conversationIds: string[];
      pinned_at?: string | null;
      archived_at?: string | null;
      hidden_at?: string | null;
    }) => {
      if (!user || !conversationIds.length) return;
      const { error } = await supabase
        .from("conversation_participants")
        .update(updates)
        .in("conversation_id", conversationIds)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["archived-conversations"] });
    },
  });
}

/**
 * Finds or creates a 1:1 conversation with another user, via the
 * get_or_create_direct_conversation() RPC (see 13_direct_messaging.sql) —
 * never inserts into conversations directly.
 */
export function useStartConversation() {
  return useMutation({
    mutationFn: async (otherUserId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("get_or_create_direct_conversation", {
        p_other_user_id: otherUserId,
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Total unread conversation count, for the bottom nav badge — mirrors
 * useUnreadCount() from useNotifications.ts, just derived from the
 * conversations list's per-conversation `unread` flag instead of a
 * dedicated query.
 */
export function useUnreadConversationCount(): number {
  const { data: conversations } = useConversations();
  return conversations?.filter((c) => c.unread).length ?? 0;
}

export interface ArchivedConversationSummary extends ConversationSummary {
  is_request: boolean;
}

/**
 * Everything currently archived for the current user — both manually
 * archived chats and pending message requests (is_request: true, from
 * people who don't follow them back yet). Powers the Archive screen.
 */
export function useArchivedConversations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["archived-conversations", user?.id],
    queryFn: async (): Promise<ArchivedConversationSummary[]> => {
      const { data: myParticipation, error } = await supabase
        .from("conversation_participants")
        .select("conversation_id, last_read_at, is_request")
        .eq("user_id", user!.id)
        .not("archived_at", "is", null)
        .is("hidden_at", null);

      if (error) throw error;
      if (!myParticipation?.length) return [];

      const conversationIds = myParticipation.map((p) => p.conversation_id);
      const readMap = new Map(myParticipation.map((p) => [p.conversation_id, p.last_read_at]));
      const requestMap = new Map(myParticipation.map((p) => [p.conversation_id, p.is_request]));

      const { data: conversations, error: convError } = await supabase
        .from("conversations")
        .select(
          "id, last_message_at, is_group, team_page:pages!conversations_team_page_id_fkey(id, username, name, avatar_url, page_type, is_verified)"
        )
        .in("id", conversationIds)
        .order("last_message_at", { ascending: false });

      if (convError) throw convError;
      if (!conversations?.length) return [];

      // Same fixed-round-trip batching as useConversations above —
      // see batchGetOtherParticipants/batchGetVisibleLastMessages/
      // batchGetUnreadCounts for the reasoning and trade-offs.
      const [otherParticipants, lastMessages, unreadCounts] = await Promise.all([
        batchGetOtherParticipants(conversationIds, user!.id),
        batchGetVisibleLastMessages(conversationIds, user!.id),
        batchGetUnreadCounts(conversationIds, user!.id, readMap),
      ]);

      const results: ArchivedConversationSummary[] = [];
      const undeliveredIds: string[] = [];

      for (const conv of conversations) {
        const otherParticipant = otherParticipants.get(conv.id);
        if (!otherParticipant) continue;

        const lastMessage = lastMessages.get(conv.id) ?? null;
        if (lastMessage && lastMessage.sender_id !== user!.id && !lastMessage.delivered_at) {
          undeliveredIds.push(lastMessage.id);
        }

        const unreadCount = unreadCounts.get(conv.id) ?? 0;

        results.push({
          id: conv.id,
          last_message_at: conv.last_message_at,
          pinned_at: null,
          archived_at: conv.last_message_at, // presence in this list already implies archived; exact value isn't read by the UI
          is_request: requestMap.get(conv.id) ?? false,
          is_group: conv.is_group,
          team_page: (conv as any).team_page ?? null,
          other_participant: otherParticipant,
          last_message: lastMessage
            ? {
                content: lastMessage.content,
                sender_id: lastMessage.sender_id,
                delivered_at: lastMessage.delivered_at,
                read_at: lastMessage.read_at,
                is_deleted: lastMessage.is_deleted,
              }
            : null,
          unread: unreadCount > 0,
          unreadCount,
        });
      }

      await backfillDelivered(undeliveredIds);

      return results;
    },
    enabled: !!user,
    refetchInterval: 15_000,
  });
}

/** When the user last opened the Archive screen — drives the badge count below. */
export function useArchiveLastSeenAt() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["archive-last-seen", user?.id],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("archive_last_seen_at")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data.archive_last_seen_at;
    },
    enabled: !!user,
  });
}

/**
 * Call this when the Archive screen mounts. Clears its badge count —
 * items that haven't been replied to yet still stay in the Archive
 * list itself, only the "new" badge clears.
 */
export function useMarkArchiveSeen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ archive_last_seen_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archive-last-seen"] });
    },
  });
}

/**
 * Count for the badge on the Archive row — NOT the bottom nav message
 * icon (that's useUnreadConversationCount above, which deliberately
 * never counts archived/request conversations, since useConversations
 * excludes anything with archived_at set). "New" here means unread and
 * arrived since the user last opened the Archive screen.
 */
export function useArchiveBadgeCount(): number {
  const { data: archived } = useArchivedConversations();
  const { data: lastSeenAt } = useArchiveLastSeenAt();

  if (!archived?.length) return 0;
  return archived.filter(
    (c) => c.unread && (!lastSeenAt || new Date(c.last_message_at) > new Date(lastSeenAt))
  ).length;
}

/**
 * Pin/unpin with a client-side 3-pin cap (mirrored at the DB level by
 * the enforce_pin_limit trigger — see sql/20_message_requests_and_archive.sql
 * — as a backstop against races or other clients). Throws
 * Error("PIN_LIMIT_REACHED") when at the cap; callers should catch that
 * specifically to show a friendly message instead of a raw DB error.
 */
export function useTogglePin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, pin }: { conversationId: string; pin: boolean }) => {
      if (!user) return;

      if (pin) {
        const { count, error: countError } = await supabase
          .from("conversation_participants")
          .select("conversation_id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .not("pinned_at", "is", null);
        if (countError) throw countError;
        if ((count ?? 0) >= 3) throw new Error("PIN_LIMIT_REACHED");
      }

      const { error } = await supabase
        .from("conversation_participants")
        .update({ pinned_at: pin ? new Date().toISOString() : null })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

/**
 * My own participant state for one conversation — currently just used
 * to know whether I'm looking at a pending message request (see the
 * banner in MessageThread.tsx). Separate small query rather than
 * reusing useConversations' list shape, same reasoning as
 * useOtherParticipant in MessageThread.tsx.
 */
export function useMyParticipantState(conversationId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-participant-state", conversationId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversation_participants")
        .select("is_request, pinned_at, archived_at, left_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId && !!user,
  });
}
