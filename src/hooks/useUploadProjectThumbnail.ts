import { useMutation } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { getImageSize, fileExtension, type LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";
import { useAuth } from "./useAuth";
import { matchesThumbSpec, type ThumbSpec } from "../lib/thumbnailSpec";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // matches the post-media bucket limit
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface UploadedThumbnail {
  url: string;
  width: number;
  height: number;
}

function checkFile(file: LocalFile) {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Please choose a JPEG, PNG, WebP, or GIF image.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Image must be under 50MB.");
}

async function readSize(file: LocalFile): Promise<{ width: number; height: number }> {
  try {
    return await getImageSize(file);
  } catch {
    throw new Error("Couldn't read this image. Try a different file.");
  }
}

async function uploadToPostMedia(userId: string, file: LocalFile): Promise<string> {
  const ext = fileExtension(file);
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await uploadLocalFile("post-media", path, file);
  return supabase.storage.from("post-media").getPublicUrl(path).data.publicUrl;
}

/**
 * Uploads a project thumbnail (public post-media bucket) and returns its URL and exact pixel size, which are stored on
 * the project. The image must ALREADY be the shape the project's type requires (`spec`, see lib/thumbnailSpec.ts):
 * anything else goes through the crop sheet first (useThumbnailCropper). This is the second lock behind the crop UI —
 * the database trigger is the third — so an off-shape thumbnail can't slip through.
 */
export function useUploadProjectThumbnail() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ file, spec }: { file: LocalFile; spec: ThumbSpec }): Promise<UploadedThumbnail> => {
      if (!user) throw new Error("Not signed in");
      checkFile(file);
      const { width, height } = await readSize(file);
      if (!matchesThumbSpec(width, height, spec)) {
        throw new Error(`This image isn't ${spec.label}. Crop it to that shape and try again.`);
      }
      return { url: await uploadToPostMedia(user.id, file), width, height };
    },
  });
}

/**
 * Uploads an ordinary public image exactly as it is — no shape rules. For pictures that are NOT a project's thumbnail
 * (a ticket's background template, an image inside a book chapter), which must keep their own shape.
 */
export function useUploadPublicImage() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (file: LocalFile): Promise<UploadedThumbnail> => {
      if (!user) throw new Error("Not signed in");
      checkFile(file);
      const { width, height } = await readSize(file);
      return { url: await uploadToPostMedia(user.id, file), width, height };
    },
  });
}
