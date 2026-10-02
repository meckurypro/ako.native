// src/hooks/useMeetingSharedItems.ts
import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useUploadProjectFile } from "./useUploadProjectFile";
import type { LocalFile } from "../lib/localFile";

export interface MeetingSharedItem {
  id: string;
  project_id: string;
  sender_id: string;
  kind: "message" | "link" | "file";
  body: string | null;
  file_path: string | null;
  created_at: string;
}

// The in-call "creator may also share other files and media" panel —
// this part needs no video provider at all, just Supabase (already
// in use everywhere else in the app), so it's real and working today
// once ako_projects_v5_meeting_infra.sql has run. A missing-table
// error is treated as "nothing shared yet" rather than crashing the
// call, same defensive pattern as Course's progress table.
export function useMeetingSharedItems(projectId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["meeting-shared-items", projectId],
    queryFn: async (): Promise<MeetingSharedItem[]> => {
      const { data, error } = await supabase
        .from("meeting_shared_items")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) {
        console.warn("meeting_shared_items unavailable — has the migration run yet?", error);
        return [];
      }
      return data ?? [];
    },
    enabled: !!projectId,
  });

  // Live updates during the call — a message/link/file someone else
  // drops shows up immediately rather than waiting on a refetch.
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`meeting-shared-items-${projectId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_shared_items", filter: `project_id=eq.${projectId}` },
        () => queryClient.invalidateQueries({ queryKey: ["meeting-shared-items", projectId] })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId, queryClient]);

  return query;
}

export function usePostMeetingMessage(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!user) throw new Error("Sign in to post in this meeting.");
      const trimmed = body.trim();
      const kind: MeetingSharedItem["kind"] = /^https?:\/\//.test(trimmed) ? "link" : "message";
      const { error } = await supabase
        .from("meeting_shared_items")
        .insert({ project_id: projectId, sender_id: user.id, kind, body: trimmed });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting-shared-items", projectId] }),
  });
}

export function useShareMeetingFile(projectId: string) {
  const { user } = useAuth();
  const uploadFile = useUploadProjectFile();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: LocalFile) => {
      if (!user) throw new Error("Sign in to share files in this meeting.");
      const path = await uploadFile.mutateAsync(file);
      const { error } = await supabase
        .from("meeting_shared_items")
        .insert({ project_id: projectId, sender_id: user.id, kind: "file", body: file.name, file_path: path });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meeting-shared-items", projectId] }),
  });
}
