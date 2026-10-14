// src/lib/chatMediaStore.ts
//
// WhatsApp-style manual media download for chat. A photo/document someone sent you is NOT pulled down until
// you tap it; the tap downloads it (with live progress and cancel) into the app's persistent documents
// folder, and from then on it opens straight from the device — no network, no re-signing.
//
//   <documents>/chat-media/<storage-path-key>/<original file name>
//
// The tile/card UI reads progress through `useChatMediaDownload`; downloads are shared per storage path, so
// the bubble tile and the full-screen viewer always agree (and a second tap never starts a second download).
import { Directory, File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";

import type { MediaItem } from "./chatMedia";
import { safeStorageName } from "./chatMedia";
import { getSignedMediaUrl } from "./signedMediaUrl";

export interface DownloadState {
  status: "idle" | "downloading" | "failed";
  /** 0..1, or -1 when the server didn't report a total and the item has no known size. */
  progress: number;
}

const IDLE: DownloadState = { status: "idle", progress: 0 };

const states = new Map<string, DownloadState>();
const controllers = new Map<string, AbortController>();
const inflight = new Map<string, Promise<string>>();
const localCache = new Map<string, string | null>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

function setState(key: string, next: DownloadState) {
  if (next.status === "idle") states.delete(key);
  else states.set(key, next);
  emit();
}

function fileFor(item: MediaItem): File | null {
  if (!item.path) return null;
  const folder = item.path.replace(/[^\w.-]+/g, "_");
  return new File(new Directory(new Directory(Paths.document, "chat-media"), folder), safeStorageName(item.name));
}

/** The on-device copy's URI, or null if this item hasn't been downloaded yet. */
export function getLocalUri(item: MediaItem | undefined): string | null {
  if (!item?.path) return null;
  const cached = localCache.get(item.path);
  if (cached !== undefined) return cached;
  let uri: string | null = null;
  try {
    const f = fileFor(item);
    uri = f && f.exists ? f.uri : null;
  } catch {
    uri = null;
  }
  localCache.set(item.path, uri);
  return uri;
}

/** Downloads (once) and returns the local URI. Resolves immediately if it's already on the device. */
export function downloadChatMedia(item: MediaItem): Promise<string> {
  const key = item.path;
  if (!key) return Promise.reject(new Error("not_downloadable"));
  const existing = getLocalUri(item);
  if (existing) return Promise.resolve(existing);
  const running = inflight.get(key);
  if (running) return running;

  const controller = new AbortController();
  controllers.set(key, controller);
  setState(key, { status: "downloading", progress: 0 });

  const job = (async () => {
    try {
      const remote = await getSignedMediaUrl(key);
      if (!remote) throw new Error("file_unavailable");
      const dest = fileFor(item);
      if (!dest) throw new Error("not_downloadable");
      dest.parentDirectory.create({ intermediates: true, idempotent: true });
      let lastEmitted = 0;
      const saved = await File.downloadFileAsync(remote, dest, {
        idempotent: true,
        signal: controller.signal,
        onProgress: ({ bytesWritten, totalBytes }) => {
          const total = totalBytes > 0 ? totalBytes : item.size;
          const progress = total > 0 ? Math.min(0.99, bytesWritten / total) : -1;
          // ~50 updates per download is plenty for a ring; don't re-render the list per chunk.
          if (progress === -1 || progress - lastEmitted >= 0.02) {
            lastEmitted = progress;
            setState(key, { status: "downloading", progress });
          }
        },
      });
      localCache.set(key, saved.uri);
      setState(key, { status: "idle", progress: 0 });
      return saved.uri;
    } catch (e) {
      localCache.delete(key);
      setState(key, controller.signal.aborted ? { status: "idle", progress: 0 } : { status: "failed", progress: 0 });
      throw e;
    } finally {
      inflight.delete(key);
      controllers.delete(key);
    }
  })();
  inflight.set(key, job);
  // A cancelled/failed download is reported through state; callers that don't await mustn't crash on it.
  job.catch(() => {});
  return job;
}

export function cancelChatMediaDownload(item: MediaItem | undefined): void {
  if (item?.path) controllers.get(item.path)?.abort();
}

/** Live download state + the local copy (if any) for one chat media item. */
export function useChatMediaDownload(item: MediaItem | undefined) {
  const key = item?.path ?? "";
  const state = useSyncExternalStore(subscribe, () => states.get(key) ?? IDLE);
  const localUri = getLocalUri(item);
  return {
    localUri,
    status: state.status,
    progress: state.progress,
    start: () => (item ? downloadChatMedia(item) : Promise.reject(new Error("no_item"))),
    cancel: () => cancelChatMediaDownload(item),
  };
}
