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
