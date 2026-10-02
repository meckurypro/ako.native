// src/hooks/useActivity.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

// One "thing you can go check on" entry — an event you have a ticket
// for, a meeting you bought access to, or a room meeting for a room
// you're a member of. Deliberately flattened into one shape so the
// Activity tab can just render one list, split into upcoming/past by
// `when`.
export interface ActivityItem {
  kind: "event" | "meeting" | "room_meeting";
  projectId: string;
  projectTitle: string;
  thumbnailUrl: string | null;
  when: string | null; // ISO — null only possible for an event with no date set yet
  roomMeetingId?: string; // only set for kind === "room_meeting"
}

// Three separate queries stitched together client-side rather than
// one big view — each source has a different join path (tickets vs.
// purchases vs. room membership) and this is a profile tab, not a
// hot path, so the extra round trips are the simpler tradeoff.
export function useActivity() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["activity", user?.id],
    queryFn: async (): Promise<ActivityItem[]> => {
      const items: ActivityItem[] = [];

      const { data: tickets } = await supabase
        .from("event_tickets")
        .select("project:projects!event_tickets_project_id_fkey(id, title, thumbnail_url, project_event_details(event_date))")
        .eq("buyer_id", user!.id);
      for (const row of (tickets as any[]) ?? []) {
        const p = row.project;
        if (!p) continue;
        items.push({
          kind: "event",
          projectId: p.id,
          projectTitle: p.title,
          thumbnailUrl: p.thumbnail_url,
          when: p.project_event_details?.[0]?.event_date ?? null,
        });
      }

      const { data: meetingPurchases } = await supabase
        .from("purchases")
        .select("project:projects!purchases_project_id_fkey(id, title, thumbnail_url, project_type, project_meeting_details(scheduled_at))")
        .eq("buyer_id", user!.id);
      for (const row of (meetingPurchases as any[]) ?? []) {
        const p = row.project;
        if (!p || p.project_type !== "meeting") continue;
        items.push({
          kind: "meeting",
          projectId: p.id,
          projectTitle: p.title,
          thumbnailUrl: p.thumbnail_url,
          when: p.project_meeting_details?.[0]?.scheduled_at ?? null,
        });
      }

      const { data: roomMeetings } = await supabase
        .from("room_meetings")
        .select("id, scheduled_at, project:projects!room_meetings_project_id_fkey(id, title, thumbnail_url), room_members!inner(user_id)")
        .eq("room_members.user_id", user!.id);
      for (const row of (roomMeetings as any[]) ?? []) {
        const p = row.project;
        if (!p) continue;
        items.push({
          kind: "room_meeting",
          projectId: p.id,
          projectTitle: p.title,
          thumbnailUrl: p.thumbnail_url,
          when: row.scheduled_at,
          roomMeetingId: row.id,
        });
      }

      return items.sort((a, b) => {
        if (!a.when) return 1;
        if (!b.when) return -1;
        return new Date(a.when).getTime() - new Date(b.when).getTime();
      });
    },
    enabled: !!user,
  });
}
