// src/lib/downloadChatFile.ts
// Opens a chat document the way WhatsApp does: download it, then hand it to the system
// share/open sheet (which also covers "save to Files" and "open with…").
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { MediaItem } from "./chatMedia";
import { safeStorageName } from "./chatMedia";
import { getSignedMediaUrl } from "./signedMediaUrl";

export async function openChatFile(item: MediaItem): Promise<void> {
  const remote = item.path ? await getSignedMediaUrl(item.path) : (item.url ?? null);
  if (!remote) throw new Error("file_unavailable");

  let localUri = remote;
  if (!remote.startsWith("file:")) {
    const dest = new File(new Directory(Paths.cache), safeStorageName(item.name));
    if (dest.exists) dest.delete();
    const saved = await File.downloadFileAsync(remote, dest);
    localUri = saved.uri;
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error("sharing_unavailable");
  await Sharing.shareAsync(localUri, { mimeType: item.mime, dialogTitle: item.name });
}
