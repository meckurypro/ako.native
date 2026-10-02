import { useMutation } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { getImageSize, fileExtension, type LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";
import { useAuth } from "./useAuth";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // matches the 50MB post-media bucket limit
// Video removed from posts — item 4: posts are text, images, or slides
// (multiple images) only, going forward. isVideoUrl below is kept:
// posts uploaded before this restriction may still carry a video URL
// in media_urls, and those need to keep rendering correctly.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Guards against a class of "broken attachment" bug where a corrupted
// or truncated file (a partially-synced photo, an interrupted OS
// export, etc.) passes the MIME/size checks above — MIME type comes
// from the OS, not the bytes, and file.size only ever caught files
// that were too *big* — but has no actual decodable image data. That
// file still uploads "successfully" (storage doesn't care what the
// bytes are) and gets attached to the post, and only shows up as a
// broken image days later once someone reports it. Decoding it here
// catches that at compose time instead, when the person can just
// re-pick the photo.
async function assertDecodableImage(file: LocalFile): Promise<void> {
  try {
    await getImageSize(file);
  } catch {
    throw new Error("That image looks corrupted — try picking it again.");
  }
}

export function useUploadPostMedia() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (file: LocalFile): Promise<string> => {
      if (!user) throw new Error("Not signed in");

      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error("Please choose a JPEG, PNG, WebP, or GIF image.");
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("File must be under 50MB.");
      }

      await assertDecodableImage(file);

      // Same path convention as avatars — {user_id}/... — enforced by
      // the post-media bucket's RLS policy (04_storage_buckets.sql).
      const ext = fileExtension(file);
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await uploadLocalFile("post-media", path, file);

      const { data } = supabase.storage.from("post-media").getPublicUrl(path);
      return data.publicUrl;
    },
  });
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}
