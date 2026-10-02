// src/hooks/usePageNotifications.ts
//
// Page-mode counterpart to useNotifications.ts. A page's Activity bell
// should show notifications ABOUT the page (new followers, comments/
// reactions on posts published as the page, team activity) — separate
// from whichever human is currently acting as that page, and shared by
// every active team member, not just whoever's logged in right now.
//
// Backend is live: public.page_notifications exists with RLS scoped to
// active page_members, and every engagement trigger that fires for
// personal notifications (comment, reaction, gift, follow) has a
// page-side companion (notify_page_on_comment, notify_page_on_reaction,
// notify_page_on_gift, notify_page_on_follow) that inserts here instead
// when the content's posted_as_page_id is set.
//
// Deliberately a SEPARATE table rather than a nullable page_id column
// on notifications — keeps the existing personal-notifications RLS
// policy untouched and avoids a mutually-exclusive-columns constraint.
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { NotificationWithActor } from "./useNotifications";

export function usePageNotifications(pageId: string | undefined) {
  const queryClient = useQueryClient();

  // Same reasoning as useNotifications' realtime subscription — team
  // members shouldn't need to refresh to see a page's activity land.
  useEffect(() => {
    if (!pageId) return;

    const channel = supabase
      .channel(`page-notifications:${pageId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "page_notifications", filter: `page_id=eq.${pageId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["page-notifications", pageId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pageId, queryClient]);

  return useQuery({
    queryKey: ["page-notifications", pageId],
    queryFn: async (): Promise<NotificationWithActor[]> => {
      if (!pageId) return [];

      const { data, error } = await supabase
        .from("page_notifications")
        .select(`*, actor:profiles!page_notifications_actor_id_fkey(username, display_name, avatar_url)`)
        .eq("page_id", pageId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as unknown as NotificationWithActor[];
    },
    enabled: !!pageId,
    // Realtime handles the instant case; this is a safety net.
    refetchInterval: 2 * 60_000,
  });
}

export function usePageUnreadCount(pageId: string | undefined) {
  const { data } = usePageNotifications(pageId);
  return data?.filter((n) => !n.read_at).length ?? 0;
}

export function useMarkPageNotificationRead(pageId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("page_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-notifications", pageId] });
    },
  });
}

export function useMarkAllPageNotificationsRead(pageId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!pageId) return;
      const { error } = await supabase
        .from("page_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("page_id", pageId)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-notifications", pageId] });
    },
  });
}
