// src/hooks/useActivity.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { fetchRemovedProjectIds } from "./useLibraryRemovals";
import { fetchListPrefs, pinnedFirst } from "./useProjectListPrefs";

// One "thing you can go check on" entry — an event you have a ticket
// for, a meeting you bought access to, or a room meeting for a room
// you're a member of. Deliberately flattened into one shape so the
// Activity tab can just render one list, split into upcoming/past by
// `when`.
export interface ActivityItem {
  kind: "event" | "meeting" | "room_meeting" | "room";
  projectId: string;
  projectTitle: string;
  /** The project's public address (the /:slug page). Sharing always links to it, never straight to the content. */
  slug: string | null;
  thumbnailUrl: string | null;
  /** Pinned to the top of its list by this person. */
  pinned: boolean;
  /** This person muted its updates (room meeting notifications, group chat pushes). */
  muted: boolean;
  /** Groups only: this person owns it, so they can't exit it. */
  isOwner: boolean;
  when: string | null; // ISO — null only possible for an event with no date set yet
  meetingTitle?: string | null; // room meetings: the meeting's own title, shown under the room name
  meetingStatus?: string; // room meetings: scheduled | live | ended
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
        .select("project:projects!event_tickets_project_id_fkey(id, title, slug, thumbnail_url, project_event_details(event_date))")
        .eq("buyer_id", user!.id);
      for (const row of (tickets as any[]) ?? []) {
        const p = row.project;
        if (!p) continue;
        items.push({
          kind: "event",
          projectId: p.id,
          projectTitle: p.title,
          slug: p.slug ?? null,
          thumbnailUrl: p.thumbnail_url,
          pinned: false,
          muted: false,
          isOwner: false,
          when: p.project_event_details?.[0]?.event_date ?? null,
        });
      }

      const { data: meetingPurchases } = await supabase
        .from("purchases")
        .select("project:projects!purchases_project_id_fkey(id, title, slug, thumbnail_url, project_type, project_meeting_details(scheduled_at))")
        .eq("buyer_id", user!.id);
      for (const row of (meetingPurchases as any[]) ?? []) {
        const p = row.project;
        if (!p || p.project_type !== "meeting") continue;
        items.push({
          kind: "meeting",
          projectId: p.id,
          projectTitle: p.title,
          slug: p.slug ?? null,
          thumbnailUrl: p.thumbnail_url,
          pinned: false,
          muted: false,
          isOwner: false,
          when: p.project_meeting_details?.[0]?.scheduled_at ?? null,
        });
      }

      // Rooms you're in, own, or help host. Room meetings come from these, so hosts see their own
      // schedule too and a member who left stops seeing a room's meetings.
      const roomIds = new Set<string>();
      const ownedRoomIds = new Set<string>();
      const [memberRows, ownedRows, modRows] = await Promise.all([
        supabase.from("room_members").select("project_id").eq("user_id", user!.id),
        supabase.from("projects").select("id").eq("owner_id", user!.id).eq("project_type", "room"),
        supabase.from("room_moderators").select("project_id").eq("user_id", user!.id),
      ]);
      for (const r of (memberRows.data as { project_id: string }[]) ?? []) roomIds.add(r.project_id);
      for (const r of (ownedRows.data as { id: string }[]) ?? []) {
        roomIds.add(r.id);
        ownedRoomIds.add(r.id);
      }
      for (const r of (modRows.data as { project_id: string }[]) ?? []) roomIds.add(r.project_id);

      if (roomIds.size > 0) {
        const ids = [...roomIds];
        const [{ data: rooms }, { data: roomMeetings }] = await Promise.all([
          supabase.from("projects").select("id, title, slug, thumbnail_url").in("id", ids).eq("is_active", true),
          supabase
            .from("room_meetings")
            .select("id, title, scheduled_at, status, project:projects!room_meetings_project_id_fkey(id, title, slug, thumbnail_url)")
            .in("project_id", ids)
            .neq("status", "cancelled"),
        ]);
        for (const p of (rooms as { id: string; title: string; slug: string | null; thumbnail_url: string | null }[]) ?? []) {
          items.push({ kind: "room", projectId: p.id, projectTitle: p.title, slug: p.slug ?? null, thumbnailUrl: p.thumbnail_url, pinned: false, muted: false, isOwner: false, when: null });
        }
        for (const row of (roomMeetings as any[]) ?? []) {
          const p = row.project;
          if (!p) continue;
          items.push({
            kind: "room_meeting",
            projectId: p.id,
            projectTitle: p.title,
            slug: p.slug ?? null,
            thumbnailUrl: p.thumbnail_url,
            pinned: false,
            muted: false,
            isOwner: false,
            when: row.scheduled_at,
            roomMeetingId: row.id,
            meetingTitle: row.title,
            meetingStatus: row.status,
          });
        }
      }

      // Anything the person chose to remove from Connect stays hidden (access itself is unchanged). Pins and mutes are
      // theirs too: pinned items lead the list, and the date order below holds inside each group.
      const [removed, prefs] = await Promise.all([fetchRemovedProjectIds(user!.id), fetchListPrefs(user!.id)]);
      const visible = items
        .filter((i) => !removed.has(i.projectId))
        .map((i) => ({
          ...i,
          pinned: prefs.get(i.projectId)?.pinned ?? false,
          muted: prefs.get(i.projectId)?.muted ?? false,
          isOwner: ownedRoomIds.has(i.projectId),
        }))
        .sort((a, b) => {
          if (!a.when) return 1;
          if (!b.when) return -1;
          return new Date(a.when).getTime() - new Date(b.when).getTime();
        });
      return pinnedFirst(visible);
    },
    enabled: !!user,
  });
}
