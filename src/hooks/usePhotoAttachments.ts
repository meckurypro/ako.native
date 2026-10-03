// src/hooks/usePhotoAttachments.ts
// Photo attachments for a post form: pick from the library, upload each, keep
// the uploaded URLs (max 4), and surface upload errors.
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";

import { fromImagePickerAsset } from "@/lib/localFile";
import { useUploadPostMedia } from "./useUploadPostMedia";

export const MAX_MEDIA_FILES = 4;

export function usePhotoAttachments(initial: string[] = []) {
  const [mediaUrls, setMediaUrls] = useState<string[]>(initial);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadMedia = useUploadPostMedia();

  async function addPhotos() {
    const remaining = MAX_MEDIA_FILES - mediaUrls.length;
    if (remaining <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (result.canceled) return;

    if (mediaUrls.length + result.assets.length > MAX_MEDIA_FILES) {
      setUploadError(`You can attach up to ${MAX_MEDIA_FILES} files.`);
      return;
    }
    setUploadError(null);

    for (const asset of result.assets) {
      try {
        const url = await uploadMedia.mutateAsync(fromImagePickerAsset(asset));
        setMediaUrls((prev) => [...prev, url]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed.");
        break;
      }
    }
  }

  return {
    mediaUrls,
    setMediaUrls,
    removeMedia: (url: string) => setMediaUrls((prev) => prev.filter((u) => u !== url)),
    addPhotos,
    uploading: uploadMedia.isPending,
    atLimit: mediaUrls.length >= MAX_MEDIA_FILES,
    uploadError,
  };
}
