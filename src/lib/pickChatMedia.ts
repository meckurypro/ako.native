// src/lib/pickChatMedia.ts
// The three ways to attach something in chat — gallery (multi-select), camera, document.
// Each returns LocalFiles ready for MediaComposeModal; an empty array means the person cancelled.
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import { MAX_ALBUM_ITEMS } from "./chatMedia";
import { fromDocumentPickerAsset, fromImagePickerAsset, type LocalFile } from "./localFile";

export async function pickGalleryImages(): Promise<LocalFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: MAX_ALBUM_ITEMS,
    orderedSelection: true,
    quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, MAX_ALBUM_ITEMS).map(fromImagePickerAsset);
}

/** Throws Error("camera_denied") when the camera permission is refused, so the caller can say so. */
export async function takePhoto(): Promise<LocalFile[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("camera_denied");
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
  if (result.canceled) return [];
  return result.assets.slice(0, 1).map(fromImagePickerAsset);
}

export async function pickDocument(): Promise<LocalFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return [];
  return result.assets.slice(0, 1).map(fromDocumentPickerAsset);
}
