// src/hooks/useEventHighlights.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { fileExtension, type LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";

export interface EventHighlight {
  id: string;
  project_id: string;
  uploader_id: string;
  media_type: "photo" | "video" | "audio";
  file_url: string;
  caption: string | null;
  created_at: string;
}

const MAX_FILE_SIZE = 300 * 1024 * 1024; // matches the event-highlights bucket limit

function mediaTypeFor(file: LocalFile): EventHighlight["media_type"] | null {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

// Post-event recap content — deliberately public (see the migration's
// RLS: SELECT is open to everyone), since this is promotional material
// for the host's future events, not something a ticket gates. Only
// the event's owner can post or remove highlights.
export function useEventHighlights(projectId: string | undefined) {
  return useQuery({
    queryKey: ["event-highlights", projectId],
    queryFn: async (): Promise<EventHighlight[]> => {
      const { data, error } = await supabase
        .from("event_highlights")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("event_highlights unavailable — has the migration run yet?", error);
        return [];
      }
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export function useAddEventHighlight(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, caption }: { file: LocalFile; caption?: string }) => {
      if (!user) throw new Error("Sign in to post highlights.");
      const mediaType = mediaTypeFor(file);
      if (!mediaType) throw new Error("Please choose a photo, video, or audio file.");
      if (file.size > MAX_FILE_SIZE) throw new Error("File must be under 300MB.");

      const ext = fileExtension(file);
      const path = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await uploadLocalFile("event-highlights", path, file);

      const { data } = supabase.storage.from("event-highlights").getPublicUrl(path);

      const { error } = await supabase.from("event_highlights").insert({
        project_id: projectId,
        uploader_id: user.id,
        media_type: mediaType,
        file_url: data.publicUrl,
        caption: caption?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-highlights", projectId] }),
  });
}

export function useDeleteEventHighlight(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (highlightId: string) => {
      const { error } = await supabase.from("event_highlights").delete().eq("id", highlightId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event-highlights", projectId] }),
  });
}
