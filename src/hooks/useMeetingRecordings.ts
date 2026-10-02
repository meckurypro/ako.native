// src/hooks/useMeetingRecordings.ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface MeetingRecording {
  id: string;
  project_id: string;
  file_path: string;
  duration_seconds: number | null;
  created_at: string;
}

// Requires meeting_recordings from ako_projects_v5_meeting_infra.sql,
// populated by the livekit-webhook edge function described in
// MEETING_INFRA.md once a recording actually finishes rendering —
// nothing on the client ever inserts into this table directly. This
// is the "recording is automatically shared in the meeting as an end
// product" requirement: the moment that webhook lands a row, this
// list picks it up with no further frontend change needed.
export function useMeetingRecordings(projectId: string | undefined) {
  return useQuery({
    queryKey: ["meeting-recordings", projectId],
    queryFn: async (): Promise<MeetingRecording[]> => {
      const { data, error } = await supabase
        .from("meeting_recordings")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("meeting_recordings unavailable — has the migration run yet?", error);
        return [];
      }
      return data ?? [];
    },
    enabled: !!projectId,
    // A finished recording usually lands a little after the call ends
    // (the provider needs time to render/upload it) — poll gently so
    // it shows up without anyone needing to manually refresh.
    refetchInterval: 15000,
  });
}

// Mirrors get-project-file's pattern for File/Media: a signed,
// short-lived URL, re-checked for access server-side rather than
// trusting the client's own hasAccess.
export function useGetRecordingUrl() {
  return useMutation({
    mutationFn: async (recordingId: string): Promise<string> => {
      const { data, error } = await supabase.functions.invoke("get-meeting-recording", {
        body: { recordingId },
      });
      if (error || !data?.url) {
        throw new Error("Recording playback isn't connected yet — see MEETING_INFRA.md.");
      }
      return data.url as string;
    },
  });
}

export function useStartMeetingRecording(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("start-meeting-recording", {
        body: { projectId },
      });
      if (error) throw new Error("Recording isn't connected yet — see MEETING_INFRA.md.");
      return data;
    },
  });
}

export function useStopMeetingRecording(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("stop-meeting-recording", {
        body: { projectId },
      });
      if (error) throw new Error("Recording isn't connected yet — see MEETING_INFRA.md.");
    },
  });
}
