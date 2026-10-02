// src/hooks/usePageInbox.ts
//
// Page-mode counterpart to useMessaging.ts. A page's inbox is its own
// shared conversation list — visible to every active team member, sent
// "from" the page rather than from whichever human is typing — separate
// from that team member's personal DMs.
//
// DELIBERATELY SMALLER SCOPE than personal messaging. useMessaging.ts
// (~1250 lines) covers pin/archive/multi-select/hidden-per-user/voice
// notes/reactions/read-receipt ticks/message requests. Reproducing all
// of that for pages blind, against a backend that doesn't exist yet,
// would be a lot of speculative code with no way to verify it against
// real behavior. This is a v1: list conversations, open a thread, send
// and receive plain text, mark read. Pin/archive/voice notes/reactions
// for the page inbox are a follow-up once this shape is confirmed to
// be the right one and the backend exists.
//
// BACKEND NOT YET BUILT. Needed:
//
//   create table public.page_conversations (
//     id uuid primary key default gen_random_uuid(),
//     page_id uuid not null references public.pages(id),
//     other_profile_id uuid not null references public.profiles(id),
//     last_message_at timestamptz not null default now(),
//     created_at timestamptz not null default now(),
//     unique (page_id, other_profile_id)
//   );
//
//   create table public.page_messages (
//     id uuid primary key default gen_random_uuid(),
//     conversation_id uuid not null references public.page_conversations(id),
//     sender_type text not null check (sender_type in ('page', 'profile')),
//     -- sender_type = 'page' means any active team member sent it AS
//     -- the page; we don't track which specific member for v1.
//     content text not null check (char_length(content) <= 2000),
//     created_at timestamptz not null default now(),
//     read_at timestamptz
//   );
//   -- RLS: page side readable/writable by active page_members; profile
//   -- side readable/writable by other_profile_id = auth.uid().
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface PageConversationSummary {
  id: string;
  last_message_at: string;
  other_participant: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  last_message: { content: string; sender_type: "page" | "profile" } | null;
  unreadCount: number;
}

export interface PageMessage {
  id: string;
  conversation_id: string;
  sender_type: "page" | "profile";
  content: string;
  created_at: string;
  read_at: string | null;
}

export function usePageConversations(pageId: string | undefined) {
  return useQuery({
    queryKey: ["page-conversations", pageId],
    queryFn: async (): Promise<PageConversationSummary[]> => {
      if (!pageId) return [];

      const { data, error } = await supabase
        .from("page_conversations")
        .select(
          `id, last_message_at,
           other_participant:profiles!page_conversations_other_profile_id_fkey(id, username, display_name, avatar_url),
           page_messages(content, sender_type, created_at, read_at)`
        )
        .eq("page_id", pageId)
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row: any) => {
        const messages = (row.page_messages ?? []) as PageMessage[];
        const last = messages.length
          ? messages.reduce((a, b) => (a.created_at > b.created_at ? a : b))
          : null;
        const unreadCount = messages.filter((m) => m.sender_type === "profile" && !m.read_at).length;
        return {
          id: row.id,
          last_message_at: row.last_message_at,
          other_participant: row.other_participant,
          last_message: last ? { content: last.content, sender_type: last.sender_type } : null,
          unreadCount,
        };
      });
    },
    enabled: !!pageId,
    refetchInterval: 15_000,
  });
}

export function usePageInboxUnreadCount(pageId: string | undefined): number {
  const { data } = usePageConversations(pageId);
  return data?.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;
}

export function usePageThread(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["page-thread", conversationId],
    queryFn: async (): Promise<PageMessage[]> => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("page_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PageMessage[];
    },
    enabled: !!conversationId,
    refetchInterval: 5_000,
  });
}

export function useSendPageMessage(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      if (!conversationId) throw new Error("No conversation");
      const { error } = await supabase
        .from("page_messages")
        .insert({ conversation_id: conversationId, sender_type: "page", content });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-thread", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["page-conversations"] });
    },
  });
}

export function useMarkPageThreadRead(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!conversationId) return;
      const { error } = await supabase
        .from("page_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("sender_type", "profile")
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-conversations"] });
    },
  });
}

/** Start (or reuse) a page's conversation with a given profile — e.g.
 *  from a "Message this page" button on PagePage viewed by that profile,
 *  or the page starting a conversation from that profile's page. */
export function useStartPageConversation(pageId: string | undefined) {
  return useMutation({
    mutationFn: async (otherProfileId: string): Promise<string> => {
      if (!pageId) throw new Error("No active page");
      const { data: existing } = await supabase
        .from("page_conversations")
        .select("id")
        .eq("page_id", pageId)
        .eq("other_profile_id", otherProfileId)
        .maybeSingle();
      if (existing) return existing.id;

      const { data, error } = await supabase
        .from("page_conversations")
        .insert({ page_id: pageId, other_profile_id: otherProfileId })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
  });
}
