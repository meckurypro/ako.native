// src/lib/pickImage.ts
// Pick ONE image from the photo library and return it as a LocalFile (or null
// if cancelled). The web screens used a hidden <input type="file">; this is the
// native equivalent. `aspect` turns on the system crop UI with that ratio.
import * as ImagePicker from "expo-image-picker";

import { fromImagePickerAsset, type LocalFile } from "./localFile";

export async function pickSingleImage(options: { aspect?: [number, number] } = {}): Promise<LocalFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    allowsEditing: !!options.aspect,
    aspect: options.aspect,
    quality: 1,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return fromImagePickerAsset(result.assets[0]);
}

// Pick several images at once (supporting images). `limit` caps how many the system
// picker lets the user choose; we slice again defensively because Android pickers
// don't all honour it. No crop UI — they're cropped to the thumbnail's shape on display.
export async function pickImages(options: { limit: number }): Promise<LocalFile[]> {
  if (options.limit <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: options.limit,
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, options.limit).map(fromImagePickerAsset);
}
