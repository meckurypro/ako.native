// src/lib/downloadChatFile.ts
// Opens a chat document the way WhatsApp does: download it (kept on the device — see chatMediaStore.ts, so
// the next open is instant and works offline), then hand it to the system share/open sheet (which also
// covers "save to Files" and "open with…").
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { MediaItem } from "./chatMedia";
import { safeStorageName } from "./chatMedia";
import { downloadChatMedia } from "./chatMediaStore";

export async function openChatFile(item: MediaItem): Promise<void> {
  let localUri: string;
  if (item.path) {
    localUri = await downloadChatMedia(item); // no-op when it's already on the device
  } else if (item.url?.startsWith("file:")) {
    localUri = item.url; // the sender's own not-yet-uploaded copy
  } else if (item.url) {
    const dest = new File(new Directory(Paths.cache), safeStorageName(item.name));
    if (dest.exists) dest.delete();
    localUri = (await File.downloadFileAsync(item.url, dest)).uri;
  } else {
    throw new Error("file_unavailable");
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error("sharing_unavailable");
  await Sharing.shareAsync(localUri, { mimeType: item.mime, dialogTitle: item.name });
}
