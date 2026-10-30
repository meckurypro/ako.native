// src/hooks/useRoom.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { encodeVoiceNote } from "../lib/voiceNotes";
import { fileExtension, type LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";
import type { GroupKind, GroupRole } from "../lib/groups";

export interface RoomMember {
  project_id: string;
  user_id: string;
  joined_at: string;
}

export interface RoomPost {
  id: string;
  project_id: string;
  sender_id: string;
  type: "text" | "audio" | "video" | "image" | "voice_note";
  content: string | null;
  media_url: string | null;
  downloadable: boolean;
  created_at: string;
}

export interface RoomMeeting {
  id: string;
  project_id: string;
  title: string | null;
  scheduled_at: string;
  provider_room_id: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  recording_url: string | null;
  // Requires the ako_projects_v8_room_cohort migration.
  recording_enabled: boolean;
  created_at: string;
}

export interface Assignment {
  id: string;
  project_id: string;
  host_id: string;
  title: string;
  description: string | null;
  required_format: "text" | "audio" | "video" | "image";
  due_at: string | null;
  created_at: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  user_id: string;
  format: "text" | "audio" | "video" | "image";
  content: string | null;
  media_url: string | null;
  submitted_at: string;
  // Requires the ako_projects_v8_room_cohort migration — defaulted
  // wherever read, same pattern as elsewhere in this series.
  feedback: string | null;
  status: "pending" | "approved" | "needs_revision";
  reviewed_at: string | null;
}

// ---------------------------------------------------------------
// Membership
// ---------------------------------------------------------------

// Membership is granted only by the purchase edge function (no
// client INSERT policy on room_members) — this just checks whether
// the current user is already in.
export function useIsRoomMember(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-room-member", projectId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("room_members")
        .select("user_id")
        .eq("project_id", projectId)
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!projectId && !!user,
  });
}

export function useRoomMemberCount(projectId: string | undefined) {
  return useQuery({
    queryKey: ["room-member-count", projectId],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("room_members")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!projectId,
  });
}

export interface RoomMemberProfile {
  user_id: string;
  joined_at: string;
  profile: { username: string; display_name: string; avatar_url: string | null };
}

// Needed so group chat messages can show each sender's own name and
// avatar — unlike a 1:1 DM, there's no single "other participant" to
// assume, so every message's sender_id has to resolve against the
// actual member list.
export function useRoomMembersList(projectId: string | undefined) {
  return useQuery({
    queryKey: ["room-members-list", projectId],
    queryFn: async (): Promise<RoomMemberProfile[]> => {
      const { data, error } = await supabase
        .from("room_members")
        .select("user_id, joined_at, profile:profiles!room_members_user_id_fkey(username, display_name, avatar_url)")
        .eq("project_id", projectId)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RoomMemberProfile[];
    },
    enabled: !!projectId,
  });
}

export type RoomPersonRole = "owner" | "host" | "member";

export interface RoomPerson {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  role: RoomPersonRole;
  joined_at: string;
}

// Everyone in the group — the owner and hosts included. room_members only holds people who joined, so the owner and
// hosts never appear in it; the room_people RPC (supabase/ako_group_room_people.sql) merges them in.
export function useRoomPeople(projectId: string | undefined) {
  return useQuery({
    queryKey: ["room-people", projectId],
    queryFn: async (): Promise<RoomPerson[]> => {
      const { data, error } = await supabase.rpc("room_people", { p_project_id: projectId });
      if (error) throw error;
      return (data ?? []) as RoomPerson[];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

export interface SenderProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

// People who wrote in the chat but are no longer in the group (left or removed) still need a name on their old
// messages — look those few up directly instead of showing "Member".
export function useProfilesByIds(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["profiles-by-ids", key],
    queryFn: async (): Promise<SenderProfile[]> => {
      const { data, error } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      if (error) throw error;
      return (data ?? []) as SenderProfile[];
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
}

// "Host" = the project's owner, a member of the owning Page's team,
// or an explicitly-added room co-host — see is_room_host() in the
// migration, which this just calls so the client-side check can
// never drift from what RLS actually enforces server-side.
export function useIsRoomHost(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-room-host", projectId, user?.id],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("is_room_host", {
        p_project_id: projectId,
        p_user_id: user!.id,
      });
      if (error) {
        console.warn("is_room_host unavailable — has the migration run yet?", error);
        return false;
      }
      return !!data;
    },
    enabled: !!projectId && !!user,
  });
}

export interface RoomModerator {
  project_id: string;
  user_id: string;
  added_by: string;
  created_at: string;
  profile: { username: string; display_name: string; avatar_url: string | null };
}

export function useRoomModerators(projectId: string | undefined) {
  return useQuery({
    queryKey: ["room-moderators", projectId],
    queryFn: async (): Promise<RoomModerator[]> => {
      const { data, error } = await supabase
        .from("room_moderators")
        .select("*, profile:profiles!room_moderators_user_id_fkey(username, display_name, avatar_url)")
        .eq("project_id", projectId);
      if (error) {
        console.warn("room_moderators unavailable — has the migration run yet?", error);
        return [];
      }
      return (data ?? []) as unknown as RoomModerator[];
    },
    enabled: !!projectId,
  });
}

export function useAddRoomModerator(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (userId: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("room_moderators")
        .insert({ project_id: projectId, user_id: userId, added_by: user.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-moderators", projectId] }),
  });
}

export function useRemoveRoomModerator(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("room_moderators")
        .delete()
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-moderators", projectId] }),
  });
}

// ---------------------------------------------------------------
// Room details — lifecycle dates + chat moderation settings
// ---------------------------------------------------------------

export interface RoomDetails {
  project_id: string;
  start_date: string | null;
  end_date: string | null;
  conversation_id: string | null;
  hosts_only_chat: boolean;
  chat_muted: boolean;
  // What people who join later can read (ako_rooms_group.sql). Anchored messages are always visible.
  history_mode: RoomHistoryMode;
  // cohort | community — fixed at creation (ako_groups_kinds.sql).
  kind: GroupKind;
  // Communities only: "open" = anyone joins in one tap, "request" = a host reviews every request.
  join_mode: GroupJoinMode;
}

export type GroupJoinMode = "open" | "request";

export type RoomHistoryMode = "all" | "admins_and_anchored" | "anchored";

export function useRoomDetails(projectId: string | undefined) {
  return useQuery({
    queryKey: ["room-details", projectId],
    queryFn: async (): Promise<RoomDetails | null> => {
      const { data, error } = await supabase
        .from("project_room_details")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

// Whether the room has run past its end_date — purely a client-side
// read of the same rule room_is_closed() enforces server-side; this
// just drives what the UI shows, the migration's RLS is what
// actually restricts access.
export function useRoomIsClosed(details: RoomDetails | null | undefined): boolean {
  if (!details?.end_date) return false;
  return new Date(details.end_date).getTime() < Date.now();
}

export function useUpdateRoomDetails(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: Partial<Pick<RoomDetails, "start_date" | "end_date" | "hosts_only_chat" | "chat_muted" | "history_mode" | "join_mode">>) => {
      const { error } = await supabase
        .from("project_room_details")
        .upsert({ project_id: projectId, ...input }, { onConflict: "project_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-details", projectId] }),
  });
}

// Lazily creates (or fetches) the room's group-chat conversation.
// Safe to call every time the Chat tab opens — the RPC is a no-op
// once the conversation already exists.
export function useRoomConversationId(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc("get_or_create_room_conversation", { p_project_id: projectId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-details", projectId] }),
  });
}

// ---------------------------------------------------------------
// Classroom feed
// ---------------------------------------------------------------

export function useRoomPosts(projectId: string | undefined) {
  return useQuery({
    queryKey: ["room-posts", projectId],
    queryFn: async (): Promise<RoomPost[]> => {
      const { data, error } = await supabase
        .from("room_posts")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
    // Members/host only per RLS, and post-closure this is further
    // narrowed to media types for non-hosts — a restricted query just
    // comes back with fewer rows rather than erroring.
  });
}

export function usePostToRoom(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: { type: RoomPost["type"]; content?: string; media_url?: string }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("room_posts").insert({
        project_id: projectId,
        sender_id: user.id,
        type: input.type,
        content: input.content ?? null,
        media_url: input.media_url ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-posts", projectId] }),
  });
}

// A lecture can be a voice note too — same upload-then-encode pipeline
// useSendVoiceNote uses for chat (same "audio" bucket, same
// encodeVoiceNote packing), so VoiceMessageBubble/decodeVoiceNote work
// identically here without caring whether the row is a room_post or a
// message.
export function usePostVoiceNoteToRoom(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, durationSec, peaks }: { file: LocalFile; durationSec: number; peaks: number[] }) => {
      if (!user) throw new Error("Not signed in");
      const ext = fileExtension(file);
      // First segment must be the uploader's own auth.uid() to satisfy
      // the "audio" bucket's upload RLS policy — see the matching note
      // in useMessaging.ts's useSendVoiceNote, which had the same bug.
      // Segment 2 ("room") + the project id are what the private
      // bucket's SELECT policy checks to decide whether another room
      // member (not the uploader) can read this file back — see the
      // private_audio_bucket_with_participant_read_rls migration.
      const path = `${user.id}/room/${projectId}/${Date.now()}.${ext}`;
      await uploadLocalFile("audio", path, file);
      // Stores the PATH, not a URL — see the matching note in
      // useMessaging.ts's useSendVoiceNote.
      const content = encodeVoiceNote({ path, durationSec, peaks });

      const { error } = await supabase.from("room_posts").insert({
        project_id: projectId,
        sender_id: user.id,
        type: "voice_note",
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-posts", projectId] }),
  });
}

// ---------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------

export function useRoomMeetings(projectId: string | undefined) {
  return useQuery({
    queryKey: ["room-meetings", projectId],
    queryFn: async (): Promise<RoomMeeting[]> => {
      const { data, error } = await supabase
        .from("room_meetings")
        .select("*")
        .eq("project_id", projectId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((m) => ({ ...m, recording_enabled: m.recording_enabled ?? false })) as RoomMeeting[];
    },
    enabled: !!projectId,
  });
}

// Host-only per RLS (room_meetings write policy checks is_room_host,
// and blocks entirely once the room has closed).
export function useScheduleRoomMeeting(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: { title?: string; scheduled_at: string; recording_enabled?: boolean }) => {
      const { error } = await supabase.from("room_meetings").insert({
        project_id: projectId,
        title: input.title || null,
        scheduled_at: input.scheduled_at,
        recording_enabled: input.recording_enabled ?? false,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-meetings", projectId] }),
  });
}

// ---------------------------------------------------------------
// Polls
// ---------------------------------------------------------------

export interface RoomPollOption {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
}

export interface RoomPoll {
  id: string;
  project_id: string;
  created_by: string;
  question: string;
  allow_multiple: boolean;
  closed_at: string | null;
  created_at: string;
  options: RoomPollOption[];
  // vote counts and the current user's own vote(s), joined in client-side
  voteCounts: Record<string, number>;
  myOptionIds: string[];
}

export function useRoomPolls(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["room-polls", projectId, user?.id],
    queryFn: async (): Promise<RoomPoll[]> => {
      const { data: polls, error: pollsError } = await supabase
        .from("room_polls")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (pollsError) {
        console.warn("room_polls unavailable — has the migration run yet?", pollsError);
        return [];
      }
      const pollIds = (polls ?? []).map((p) => p.id);
      if (pollIds.length === 0) return [];

      const [{ data: options, error: optionsError }, { data: votes, error: votesError }] = await Promise.all([
        supabase.from("room_poll_options").select("*").in("poll_id", pollIds).order("sort_order", { ascending: true }),
        supabase.from("room_poll_votes").select("*").in("poll_id", pollIds),
      ]);
      if (optionsError) throw optionsError;
      if (votesError) throw votesError;

      return (polls ?? []).map((poll) => {
        const pollOptions = (options ?? []).filter((o) => o.poll_id === poll.id);
        const pollVotes = (votes ?? []).filter((v) => v.poll_id === poll.id);
        const voteCounts: Record<string, number> = {};
        for (const opt of pollOptions) voteCounts[opt.id] = pollVotes.filter((v) => v.option_id === opt.id).length;
        return {
          ...poll,
          options: pollOptions,
          voteCounts,
          myOptionIds: pollVotes.filter((v) => v.user_id === user?.id).map((v) => v.option_id),
        };
      });
    },
    enabled: !!projectId,
  });
}

export function useCreateRoomPoll(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: { question: string; options: string[]; allowMultiple?: boolean }) => {
      if (!user) throw new Error("Not signed in");
      const { data: poll, error: pollError } = await supabase
        .from("room_polls")
        .insert({ project_id: projectId, created_by: user.id, question: input.question, allow_multiple: input.allowMultiple ?? false })
        .select("id")
        .single();
      if (pollError) throw pollError;

      const rows = input.options.map((label, i) => ({ poll_id: poll.id, label, sort_order: i }));
      const { error: optionsError } = await supabase.from("room_poll_options").insert(rows);
      if (optionsError) throw optionsError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-polls", projectId] }),
  });
}

export function useVoteOnPoll(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pollId,
      optionId,
      allowMultiple,
      currentVoteIds,
    }: {
      pollId: string;
      optionId: string;
      allowMultiple: boolean;
      currentVoteIds: string[];
    }) => {
      if (!user) throw new Error("Sign in to vote.");
      // Toggling an already-selected option removes it either way.
      if (currentVoteIds.includes(optionId)) {
        const { error } = await supabase
          .from("room_poll_votes")
          .delete()
          .eq("poll_id", pollId)
          .eq("option_id", optionId)
          .eq("user_id", user.id);
        if (error) throw error;
        return;
      }
      // Single-choice polls clear any prior vote before adding the new one.
      if (!allowMultiple && currentVoteIds.length > 0) {
        const { error: clearError } = await supabase
          .from("room_poll_votes")
          .delete()
          .eq("poll_id", pollId)
          .eq("user_id", user.id);
        if (clearError) throw clearError;
      }
      const { error } = await supabase.from("room_poll_votes").insert({ poll_id: pollId, option_id: optionId, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-polls", projectId] }),
  });
}

// ---------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------

export function useAssignments(projectId: string | undefined) {
  return useQuery({
    queryKey: ["assignments", projectId],
    queryFn: async (): Promise<Assignment[]> => {
      const { data, error } = await supabase
        .from("assignments")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

// Host-only per RLS.
export function useCreateAssignment(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: {
      title: string;
      description?: string;
      required_format: Assignment["required_format"];
      due_at?: string;
    }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("assignments").insert({
        project_id: projectId,
        host_id: user.id,
        title: input.title,
        description: input.description ?? null,
        required_format: input.required_format,
        due_at: input.due_at ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignments", projectId] }),
  });
}

export function useMySubmission(assignmentId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-submission", assignmentId, user?.id],
    queryFn: async (): Promise<AssignmentSubmission | null> => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*")
        .eq("assignment_id", assignmentId)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { ...data, feedback: data.feedback ?? null, status: data.status ?? "pending", reviewed_at: data.reviewed_at ?? null }
        : null;
    },
    enabled: !!user,
  });
}

export function useSubmitAssignment(assignmentId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: { format: AssignmentSubmission["format"]; content?: string; media_url?: string }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: assignmentId,
        user_id: user.id,
        format: input.format,
        content: input.content ?? null,
        media_url: input.media_url ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-submission", assignmentId] }),
  });
}

// Host-only view of every submission for one of their assignments —
// this didn't exist before (only useMySubmission, a per-user lookup),
// which is exactly why "host reviews assignments" had nowhere to go.
export function useAssignmentSubmissions(assignmentId: string | undefined) {
  return useQuery({
    queryKey: ["assignment-submissions", assignmentId],
    queryFn: async (): Promise<(AssignmentSubmission & { profile: { username: string; display_name: string; avatar_url: string | null } })[]> => {
      const { data, error } = await supabase
        .from("assignment_submissions")
        .select("*, profile:profiles!assignment_submissions_user_id_fkey(username, display_name, avatar_url)")
        .eq("assignment_id", assignmentId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((d) => ({
        ...d,
        feedback: d.feedback ?? null,
        status: d.status ?? "pending",
        reviewed_at: d.reviewed_at ?? null,
      }));
    },
    enabled: !!assignmentId,
  });
}

export function useReviewSubmission(assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: { submissionId: string; status: "approved" | "needs_revision"; feedback?: string }) => {
      const { error } = await supabase
        .from("assignment_submissions")
        .update({ status: input.status, feedback: input.feedback?.trim() || null, reviewed_at: new Date().toISOString() })
        .eq("id", input.submissionId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assignment-submissions", assignmentId] }),
  });
}

// ---------------------------------------------------------------
// Anchored messages (ako_rooms_group.sql) — host-only, permanent for new members
// ---------------------------------------------------------------

export function useSetMessageAnchor(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, anchored }: { messageId: string; anchored: boolean }) => {
      const { error } = await supabase.rpc("set_message_anchor", { p_message_id: messageId, p_anchored: anchored });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", conversationId] }),
  });
}

// ---------------------------------------------------------------
// Joining, leaving and moderation (ako_rooms_membership.sql)
// ---------------------------------------------------------------

export type RoomJoinRequestStatus = "pending" | "approved" | "declined";

export interface RoomJoinRequest {
  project_id: string;
  user_id: string;
  status: RoomJoinRequestStatus;
  message: string | null;
  created_at: string;
  profile: { username: string; display_name: string; avatar_url: string | null };
}

// The signed-in person's own request for this room, if any.
export function useMyRoomJoinRequest(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-room-join-request", projectId, user?.id],
    queryFn: async (): Promise<{ status: RoomJoinRequestStatus } | null> => {
      const { data, error } = await supabase
        .from("room_join_requests")
        .select("status")
        .eq("project_id", projectId)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { status: RoomJoinRequestStatus } | null;
    },
    enabled: !!projectId && !!user,
  });
}

// Host view: who is waiting to be let in.
export function useRoomJoinRequests(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["room-join-requests", projectId],
    queryFn: async (): Promise<RoomJoinRequest[]> => {
      const { data, error } = await supabase
        .from("room_join_requests")
        .select("*, profile:profiles!room_join_requests_user_id_fkey(username, display_name, avatar_url)")
        .eq("project_id", projectId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RoomJoinRequest[];
    },
    enabled: !!projectId && enabled,
  });
}

export function invalidateRoomMembership(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  for (const key of [
    "is-room-member",
    "room-member-count",
    "room-members-list",
    "room-people",
    "room-member-events",
    "room-join-requests",
    "my-room-join-request",
    "room-blocklist",
  ]) {
    queryClient.invalidateQueries({ queryKey: [key, projectId] });
  }
}

export function useRequestRoomJoin(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (message?: string) => {
      const { error } = await supabase.rpc("request_room_join", { p_project_id: projectId, p_message: message ?? null });
      if (error) throw error;
    },
    onSuccess: () => invalidateRoomMembership(queryClient, projectId),
  });
}

export function useCancelRoomJoinRequest(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async () => {
      const { error } = await supabase.rpc("cancel_room_join_request", { p_project_id: projectId });
      if (error) throw error;
    },
    onSuccess: () => invalidateRoomMembership(queryClient, projectId),
  });
}

export function useReviewRoomJoinRequest(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ userId, approve }: { userId: string; approve: boolean }) => {
      const { error } = await supabase.rpc("review_room_join_request", {
        p_project_id: projectId,
        p_user_id: userId,
        p_approve: approve,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateRoomMembership(queryClient, projectId),
  });
}

export function useAddRoomMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("add_room_member", { p_project_id: projectId, p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => invalidateRoomMembership(queryClient, projectId),
  });
}

export function useLeaveRoom(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async () => {
      const { error } = await supabase.rpc("leave_room", { p_project_id: projectId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRoomMembership(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ["is-room-host", projectId] });
    },
  });
}

export function useRemoveRoomMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ userId, blacklist }: { userId: string; blacklist?: boolean }) => {
      const { error } = await supabase.rpc("remove_room_member", {
        p_project_id: projectId,
        p_user_id: userId,
        p_blacklist: !!blacklist,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateRoomMembership(queryClient, projectId),
  });
}

export interface RoomBlocklistEntry {
  project_id: string;
  user_id: string;
  created_at: string;
  profile: { username: string; display_name: string; avatar_url: string | null };
}

export function useRoomBlocklist(projectId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["room-blocklist", projectId],
    queryFn: async (): Promise<RoomBlocklistEntry[]> => {
      const { data, error } = await supabase
        .from("room_blocklist")
        .select("*, profile:profiles!room_blocklist_user_id_fkey(username, display_name, avatar_url)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RoomBlocklistEntry[];
    },
    enabled: !!projectId && enabled,
  });
}

export function useBlacklistRoomUser(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("blacklist_room_user", { p_project_id: projectId, p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => invalidateRoomMembership(queryClient, projectId),
  });
}

export function useUnblacklistRoomUser(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("unblacklist_room_user", { p_project_id: projectId, p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => invalidateRoomMembership(queryClient, projectId),
  });
}

// Host adds someone by @username (private rooms, or anyone the host wants in).
export async function findProfileByUsername(username: string): Promise<{ id: string; username: string; display_name: string } | null> {
  const clean = username.trim().replace(/^@/, "");
  if (!clean) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .ilike("username", clean)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// What a non-member may see about a group, and one-tap joining for open communities (ako_groups_kinds).
export interface GroupPublicInfo {
  kind: GroupKind;
  join_mode: GroupJoinMode;
  start_date: string | null;
  end_date: string | null;
  member_count: number;
  is_closed: boolean;
}

// Null for a private group the viewer isn't part of.
export function useGroupPublicInfo(projectId: string | undefined) {
  return useQuery({
    queryKey: ["group-public-info", projectId],
    queryFn: async (): Promise<GroupPublicInfo | null> => {
      const { data, error } = await supabase.rpc("get_group_public_info", { p_project_id: projectId });
      if (error) throw error;
      return ((data as GroupPublicInfo[]) ?? [])[0] ?? null;
    },
    enabled: !!projectId,
  });
}

export interface ProfileGroup {
  project_id: string;
  title: string;
  slug: string | null;
  kind: GroupKind;
  role: GroupRole;
  thumbnail_url: string | null;
}

// The groups a profile's owner has chosen to list. The server applies every rule (their setting, private groups,
// private accounts, blocks), so an empty list means "nothing to show" and says nothing about why.
export function useProfileGroups(profileId: string | undefined) {
  return useQuery({
    queryKey: ["profile-groups", profileId],
    queryFn: async (): Promise<ProfileGroup[]> => {
      const { data, error } = await supabase.rpc("get_profile_groups", { p_profile_id: profileId });
      if (error) throw error;
      return (data as ProfileGroup[]) ?? [];
    },
    enabled: !!profileId,
  });
}

export function useJoinOpenRoom(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async () => {
      const { error } = await supabase.rpc("join_open_room", { p_project_id: projectId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRoomMembership(queryClient, projectId);
      queryClient.invalidateQueries({ queryKey: ["group-public-info", projectId] });
    },
  });
}

// Who left (or was removed) — readable by hosts only (RLS), so members never learn that someone slipped out. The
// group chat draws these as small centred badges, only for hosts. Written by leave_room / remove_room_member.
export interface RoomMemberEvent {
  id: string;
  user_id: string;
  kind: "left" | "removed";
  created_at: string;
  display_name: string;
}

export function useRoomMemberEvents(projectId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["room-member-events", projectId],
    queryFn: async (): Promise<RoomMemberEvent[]> => {
      const { data, error } = await supabase
        .from("room_member_events")
        .select("id, user_id, kind, created_at, profile:profiles!room_member_events_user_id_fkey(display_name, username)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as unknown as { id: string; user_id: string; kind: "left" | "removed"; created_at: string; profile: { display_name: string; username: string } | null }[]).map((e) => ({
        id: e.id,
        user_id: e.user_id,
        kind: e.kind,
        created_at: e.created_at,
        display_name: e.profile?.display_name || e.profile?.username || "Someone",
      }));
    },
    enabled: !!projectId && enabled,
    refetchInterval: enabled ? 30_000 : false,
  });
}
