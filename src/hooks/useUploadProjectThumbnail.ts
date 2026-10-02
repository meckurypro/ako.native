import { useMutation } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { getImageSize, fileExtension, type LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";
import { useAuth } from "./useAuth";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // matches the post-media bucket limit
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface UploadedThumbnail {
  url: string;
  width: number;
  height: number;
}

// --------------------------------------------------------
// Reads an image file's natural pixel dimensions BEFORE upload.
// This is what makes the thumbnail's displayed aspect ratio dynamic
// instead of a hardcoded aspect-video (16:9) — ProjectCard and the
// create/edit forms use these stored numbers to set
// `aspect-ratio: width / height` on the container, matching
// whatever the creator actually uploaded (portrait, square,
// ultra-wide, anything).
// --------------------------------------------------------
export function useUploadProjectThumbnail() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (file: LocalFile): Promise<UploadedThumbnail> => {
      if (!user) throw new Error("Not signed in");

      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error("Please choose a JPEG, PNG, WebP, or GIF image.");
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("Image must be under 50MB.");
      }

      // Read dimensions from the file itself — independent of upload,
      // so this works the same regardless of where it's stored.
      let size: { width: number; height: number };
      try {
        size = await getImageSize(file);
      } catch {
        throw new Error("Couldn't read this image. Try a different file.");
      }
      const { width, height } = size;

      const ext = fileExtension(file);
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await uploadLocalFile("post-media", path, file);

      const { data } = supabase.storage.from("post-media").getPublicUrl(path);

      return { url: data.publicUrl, width, height };
    },
  });
}
