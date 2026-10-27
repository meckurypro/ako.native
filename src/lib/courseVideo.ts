// src/lib/courseVideo.ts
// Course lesson videos live in the private `course-videos` bucket (up to 1 GB). The app uploads them straight from disk
// (the same streaming mechanism as large project files, so a gigabyte never sits in memory), plays them through a signed
// link, and cleans them up when a lesson goes away.
//
// Unlike the web builder (TUS, resumable) a streamed upload is one long request: if the connection drops the upload
// fails with a clear message and starts again from the beginning. A connection that goes quiet is flagged after
// STALL_NOTICE_MS ("Reconnecting…" in the UI) and cancelled after STALL_MS rather than hanging forever.
import * as LegacyFs from "expo-file-system/legacy";
import type { ImagePickerAsset } from "expo-image-picker";

import type { LocalFile } from "./localFile";
import { supabase } from "./supabase";

export const COURSE_VIDEO_BUCKET = "course-videos";
export const MAX_COURSE_VIDEO_BYTES = 1024 * 1024 * 1024; // matches the bucket's file_size_limit
const ALLOWED = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"]);

export const UPLOAD_CANCELLED = "Upload cancelled.";
export const UPLOAD_STALLED = "Upload stalled — your connection dropped. Check it and try again.";
const STALL_NOTICE_MS = 15_000;
const STALL_MS = 60_000;
const WATCHDOG_TICK_MS = 3_000;

export interface VideoMeta {
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
}

export interface CourseUploadHandle {
  promise: Promise<void>;
  abort: () => void;
}

function mimeOf(file: LocalFile): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  if (/\.mov$/i.test(file.name)) return "video/quicktime";
  if (/\.mp4$/i.test(file.name)) return "video/mp4";
  if (/\.webm$/i.test(file.name)) return "video/webm";
  return "";
}

export function validateCourseVideo(file: LocalFile): string | null {
  if (!ALLOWED.has(mimeOf(file))) return "Use an MP4, MOV or WebM video.";
  // size 0 means "couldn't be read from the picker", not "empty": the bucket limit still applies server-side.
  if (file.size > MAX_COURSE_VIDEO_BYTES) return "Videos can be up to 1 GB.";
  return null;
}

/** Width, height and duration come with the picked asset (duration is milliseconds there). */
export function videoMetaFromAsset(asset: Pick<ImagePickerAsset, "width" | "height" | "duration">): VideoMeta | null {
  if (!asset.width || !asset.height) return null;
  const seconds = typeof asset.duration === "number" && Number.isFinite(asset.duration) ? Math.round(asset.duration / 1000) : 0;
  return { width: asset.width, height: asset.height, duration: seconds };
}

function extensionOf(file: LocalFile): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^(mp4|mov|webm|m4v)$/.test(fromName)) return fromName;
  const type = mimeOf(file);
  return type === "video/webm" ? "webm" : type === "video/quicktime" ? "mov" : "mp4";
}

/** `<user>/<project>/<unique>.<ext>` — the first two folders are what the bucket's upload policy checks. */
export function courseVideoPath(userId: string, projectId: string, file: LocalFile): string {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
  return `${userId}/${projectId}/${unique}.${extensionOf(file)}`;
}

export function uploadCourseVideo(opts: {
  file: LocalFile;
  userId: string;
  projectId: string;
  onProgress: (pct: number) => void;
  onStall?: () => void;
}): { path: string; handle: CourseUploadHandle } {
  const path = courseVideoPath(opts.userId, opts.projectId, opts.file);
  let task: ReturnType<typeof LegacyFs.createUploadTask> | null = null;
  let cancelled = false;

  const promise = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Not signed in");
    if (cancelled) throw new Error(UPLOAD_CANCELLED);

    const base = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
    const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;
    const url = `${base}/storage/v1/object/${COURSE_VIDEO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;

    let lastMoved = Date.now();
    let noticed = false;
    const active = LegacyFs.createUploadTask(
      url,
      opts.file.uri,
      {
        httpMethod: "POST",
        uploadType: LegacyFs.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anon,
          "Content-Type": mimeOf(opts.file) || "video/mp4",
          "x-upsert": "false",
          "cache-control": "max-age=3600",
        },
      },
      ({ totalBytesSent, totalBytesExpectedToSend }) => {
        lastMoved = Date.now();
        noticed = false;
        if (totalBytesExpectedToSend > 0) opts.onProgress(Math.min(99, Math.floor((totalBytesSent / totalBytesExpectedToSend) * 100)));
      },
    );
    task = active;

    let stalled = false;
    const watchdog = setInterval(() => {
      const quiet = Date.now() - lastMoved;
      if (quiet >= STALL_MS) {
        stalled = true;
        clearInterval(watchdog);
        void active.cancelAsync().catch(() => {});
      } else if (quiet >= STALL_NOTICE_MS && !noticed) {
        noticed = true;
        opts.onStall?.();
      }
    }, WATCHDOG_TICK_MS);

    let result: Awaited<ReturnType<typeof active.uploadAsync>> | undefined;
    try {
      result = await active.uploadAsync();
    } catch (err) {
      if (cancelled) throw new Error(UPLOAD_CANCELLED);
      if (stalled) throw new Error(UPLOAD_STALLED);
      throw err;
    } finally {
      clearInterval(watchdog);
      task = null;
    }
    if (cancelled) throw new Error(UPLOAD_CANCELLED);
    if (stalled) throw new Error(UPLOAD_STALLED);
    if (!result || result.status < 200 || result.status >= 300) {
      let message = "The video upload failed.";
      try {
        const parsed = JSON.parse(result?.body ?? "{}");
        if (parsed?.message) message = String(parsed.message);
      } catch {
        /* keep the generic message */
      }
      throw new Error(message);
    }
    opts.onProgress(100);
  })();

  return {
    path,
    handle: {
      promise,
      abort: () => {
        cancelled = true;
        void task?.cancelAsync().catch(() => {});
      },
    },
  };
}

/** Best effort: a leftover file is harmless, a failed cleanup shouldn't block the creator. */
export async function removeCourseVideos(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length === 0) return;
  try {
    await supabase.storage.from(COURSE_VIDEO_BUCKET).remove(list);
  } catch {
    /* a leftover file is harmless */
  }
}

export async function signedCourseVideoUrl(path: string, expiresInSeconds = 6 * 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(COURSE_VIDEO_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) throw error ?? new Error("Couldn't load this video.");
  return data.signedUrl;
}
