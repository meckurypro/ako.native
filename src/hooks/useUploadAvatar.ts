import { useMutation } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { fileExtension, type LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";
import { useAuth } from "./useAuth";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // matches the 5MB bucket limit set in 04_storage_buckets.sql
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function useUploadAvatar() {
  const { user } = useAuth();

  return useMutation({
    // No meta.blocking — was gating the entire app behind LoadingOverlay's
    // full-screen blur for the whole upload. An avatar file upload can
    // legitimately take a few seconds; the person should be free to keep
    // navigating while it finishes in the background. The local
    // "Uploading…" state on the picker button (see Settings.tsx) is
    // enough to show it's in flight.
    mutationFn: async (file: LocalFile): Promise<string> => {
      if (!user) throw new Error("Not signed in");

      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error("Please choose a JPEG, PNG, WebP, or GIF image.");
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("Image must be under 5MB.");
      }

      // Path convention MUST be {user_id}/filename — the storage RLS
      // policy from 04_storage_buckets.sql checks the first path segment
      // against auth.uid(), so anything else gets rejected at the
      // database level regardless of what this code does.
      const ext = fileExtension(file);
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      await uploadLocalFile("avatars", path, file, { upsert: true });

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      return data.publicUrl;
    },
  });
}
