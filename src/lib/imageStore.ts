// src/lib/imageStore.ts
//
// An app-owned, on-device store for remote pictures (avatars, post media, thumbnails…), so they still render with no
// network. expo-image's own disk cache stays in front of it, but alone it is not enough for offline use:
//   • iOS (SDWebImage) silently expires cached files after ~7 days, and the OS may purge them;
//   • until now the cache key was the full URL, which for signed URLs changes every hour.
//
//   <cache dir>/image-store/<hash of stable URL>.<ext>
//
// Rules: never block the UI (callers render the remote URL as a fallback), at most MAX_PARALLEL downloads, files over
// MAX_FILE_BYTES are skipped (the viewer streams those), total size capped with oldest-first eviction, writes go to a
// `.part` file and are moved into place so a half-downloaded file is never shown, failures back off for a minute.
// Chat photos/documents are NOT stored here — they have their own tap-to-download store (chatMediaStore.ts).
import { onlineManager } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";

import { collectImageUrls, isRemoteUrl, storeFileName } from "./imageKey";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_STORE_BYTES = 250 * 1024 * 1024;
const PRUNE_TO = 0.8;
const MAX_PARALLEL = 4;
const DOWNLOAD_TIMEOUT_MS = 12_000;
const RETRY_AFTER_MS = 60_000;
const STALE_PART_MS = 60 * 60 * 1000;

const root = () => new Directory(Paths.cache, "image-store");

/** file name → local uri (null = checked, not on disk). */
const known = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
const failedAt = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

const emit = (name: string) => listeners.get(name)?.forEach((l) => l());

/** Subscribe to one file's presence (for useSyncExternalStore). */
export function subscribeStoredImage(name: string, listener: () => void): () => void {
  let set = listeners.get(name);
  if (!set) listeners.set(name, (set = new Set()));
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(name);
  };
}

/** The on-device copy's uri for a store file name, or null. Synchronous and memoised. */
export function lookupStoredImage(name: string): string | null {
  const cached = known.get(name);
  if (cached !== undefined) return cached;
  let uri: string | null = null;
  try {
    const f = new File(root(), name);
    uri = f.exists && (f.size ?? 0) > 0 ? f.uri : null;
  } catch {
    uri = null;
  }
  known.set(name, uri);
  return uri;
}

export function getStoredImageUri(remoteUri: string): string | null {
  return isRemoteUrl(remoteUri) ? lookupStoredImage(storeFileName(remoteUri)) : null;
}

// ── download queue ────────────────────────────────────────────────────────────────────────────────────────────────
let running = 0;
const waiting: Array<() => void> = [];
function acquire(): Promise<void> {
  if (running < MAX_PARALLEL) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(() => { running++; resolve(); }));
}
function release() {
  running--;
  waiting.shift()?.();
}

async function download(uri: string, name: string): Promise<string | null> {
  await acquire();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const dir = root();
  const part = new File(dir, `${name}.part`);
  try {
    if (!onlineManager.isOnline()) return null;
    dir.create({ intermediates: true, idempotent: true });
    if (part.exists) part.delete();
    await File.downloadFileAsync(uri, part, {
      idempotent: true,
      signal: controller.signal,
      // The server tells us the size up front: don't pull a 40 MB video poster just to throw it away.
      onProgress: ({ totalBytes }) => {
        if (totalBytes > MAX_FILE_BYTES) controller.abort();
      },
    });
    const size = part.size ?? 0;
    if (size <= 0 || size > MAX_FILE_BYTES) throw new Error("bad_size");
    const final = new File(dir, name);
    if (final.exists) final.delete();
    part.move(final);
    known.set(name, final.uri);
    emit(name);
    schedulePrune();
    return final.uri;
  } catch {
    try {
      if (part.exists) part.delete();
    } catch {
      /* nothing to clean */
    }
    failedAt.set(name, Date.now());
    return null;
  } finally {
    clearTimeout(timer);
    release();
  }
}

/** Stores one remote image (once). Resolves to the local uri, or null if offline / too big / failed. */
export function storeImage(uri: string): Promise<string | null> {
  if (!isRemoteUrl(uri)) return Promise.resolve(null);
  const name = storeFileName(uri);
  const hit = lookupStoredImage(name);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(name);
  if (pending) return pending;
  const last = failedAt.get(name);
  if (last && Date.now() - last < RETRY_AFTER_MS) return Promise.resolve(null);
  if (!onlineManager.isOnline()) return Promise.resolve(null);
  const job = download(uri, name).finally(() => inflight.delete(name));
  inflight.set(name, job);
  return job;
}

/** Warm the store for pictures that are about to be needed (e.g. the avatars in a list that just loaded). */
export function prefetchImages(urls: readonly string[]): void {
  if (!onlineManager.isOnline()) return;
  for (const url of urls) void storeImage(url);
}

/** Warm the store from raw query data (feed page, conversation list…). */
export function prefetchImagesFromData(data: unknown): void {
  prefetchImages(collectImageUrls(data));
}

// ── eviction ──────────────────────────────────────────────────────────────────────────────────────────────────────
let pruneTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePrune(delay = 30_000) {
  if (pruneTimer) return;
  pruneTimer = setTimeout(() => {
    pruneTimer = null;
    pruneImageStore();
  }, delay);
}

export function pruneImageStore(): void {
  try {
    const dir = root();
    if (!dir.exists) return;
    const entries: { file: File; size: number; mtime: number }[] = [];
    let total = 0;
    for (const item of dir.list()) {
      if (!(item instanceof File)) continue;
      const mtime = item.modificationTime ?? 0;
      if (item.name.endsWith(".part")) {
        if (Date.now() - mtime > STALE_PART_MS) item.delete();
        continue;
      }
      const size = item.size ?? 0;
      total += size;
      entries.push({ file: item, size, mtime });
    }
    if (total <= MAX_STORE_BYTES) return;
    entries.sort((a, b) => a.mtime - b.mtime); // oldest first
    for (const e of entries) {
      if (total <= MAX_STORE_BYTES * PRUNE_TO) break;
      e.file.delete();
      total -= e.size;
      known.set(e.file.name, null);
      emit(e.file.name);
    }
  } catch {
    /* a failed prune just runs again later */
  }
}

/** Call once at startup: trims the store off the critical path. */
export function scheduleImageStorePrune(): void {
  schedulePrune(15_000);
}
