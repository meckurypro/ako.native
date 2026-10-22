// src/lib/offlineProjects.ts
//
// The pure half of "Download to library": what can be saved, what the server's answer means, how big a download is,
// whether there's room for it, and how a saved project is opened. No React Native imports on purpose — it's unit-tested
// in node (scripts/test-offline-projects.mjs). The device half (files, encrypted DB, progress) is lib/offlineStore.ts.
//
// The server is the gate (get_project_offline_bundle checks access and the host's allow_download choice); everything
// here that says "eligible" only decides whether to SHOW the option, never whether a download is allowed.

export type OfflineFileKind = "book" | "file" | "audio" | "video" | "image";

export interface OfflineFileInfo {
  kind: OfflineFileKind;
  name: string;
  bytes: number;
  mime: string | null;
  /** project_files.id, for File projects (they can hold several): which file get-project-file should sign. */
  file_id?: string | null;
}

/** What get_project_offline_bundle returns. `content` holds rows shaped exactly like the online queries' results. */
export interface OfflineBundle {
  project_id: string;
  project_type: string;
  version: string | null;
  is_owner: boolean;
  content_bytes: number;
  files: OfflineFileInfo[];
  /** The book / media details row the reader screens read (project_book_details / project_media_details), else null. */
  details: Record<string, unknown> | null;
  content: { chapters?: unknown[]; modules?: unknown[] } | null;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export type OfflineErrorCode =
  | "sign_in_required"
  | "access_denied"
  | "download_not_allowed"
  | "not_downloadable"
  | "nothing_to_download"
  | "offline"
  | "no_space"
  | "storage_unavailable"
  | "needs_confirmation"
  | "cancelled"
  | "failed";

const ERROR_COPY: Record<OfflineErrorCode, string> = {
  sign_in_required: "Sign in to download.",
  access_denied: "You don't have access to this yet.",
  download_not_allowed: "The creator hasn't allowed downloads for this one.",
  not_downloadable: "This can't be saved for offline use.",
  nothing_to_download: "There's nothing to download yet.",
  offline: "You're offline. Connect to download.",
  no_space: "Not enough free space on this device.",
  storage_unavailable: "Offline storage isn't available on this device.",
  needs_confirmation: "This is a large download.",
  cancelled: "Download cancelled.",
  failed: "Couldn't finish the download. Try again.",
};

export class OfflineError extends Error {
  readonly code: OfflineErrorCode;
  /** For needs_confirmation / no_space: how many bytes the download would take. */
  readonly bytes?: number;
  constructor(code: OfflineErrorCode, bytes?: number) {
    super(ERROR_COPY[code]);
    this.name = "OfflineError";
    this.code = code;
    this.bytes = bytes;
  }
}

const SERVER_CODES: ReadonlySet<string> = new Set(["sign_in_required", "access_denied", "download_not_allowed", "not_downloadable", "nothing_to_download"]);

/** Maps a Postgres/PostgREST error from the bundle RPC (message is the code we raise) to a typed error. */
export function offlineErrorFromServer(message: string | null | undefined): OfflineError {
  const key = (message ?? "").trim();
  return new OfflineError(SERVER_CODES.has(key) ? (key as OfflineErrorCode) : "failed");
}

/** Anything thrown while downloading → text for the person. Unknown errors never leak their internals. */
export function offlineErrorMessage(e: unknown): string {
  return e instanceof OfflineError ? e.message : ERROR_COPY.failed;
}

// ── What can be saved ───────────────────────────────────────────────────────

export const OFFLINE_TYPES = ["book", "course", "media", "file"] as const;
export type OfflineProjectType = (typeof OFFLINE_TYPES)[number];

export function isOfflineType(t: string | null | undefined): t is OfflineProjectType {
  return !!t && (OFFLINE_TYPES as readonly string[]).includes(t);
}

interface EligibilityInput {
  projectType: string;
  filePath?: string | null;
  book?: { content_source: string; allow_download: boolean; allow_read_in_app: boolean } | null;
  media?: { has_audio: boolean; has_video: boolean; has_image: boolean; audio_file_path: string | null; video_file_path: string | null; image_file_path: string | null } | null;
}

/**
 * Whether to offer "Download to library". Deliberately a little optimistic where the card doesn't have the detail yet
 * (courses: the server refuses an empty one); never offers what is certain to be refused (link books, external-only
 * media, uploaded books whose host switched downloads off).
 */
export function isOfflineEligible(i: EligibilityInput): boolean {
  switch (i.projectType) {
    case "course":
      return true;
    case "file":
      return !!i.filePath;
    case "book":
      if (!i.book) return false;
      if (i.book.content_source === "authored") return true;
      // An uploaded PDF is saved as its extracted chapters when the host allows reading in the app, or as the PDF when the
      // host allows downloads — so it's worth offering if either switch is on (the server picks which, or refuses).
      if (i.book.content_source === "upload") return i.book.allow_read_in_app || i.book.allow_download;
      return false; // "link": it's someone else's website
    case "media": {
      const m = i.media;
      if (!m) return false;
      return (m.has_audio && !!m.audio_file_path) || (m.has_video && !!m.video_file_path) || (m.has_image && !!m.image_file_path);
    }
    default:
      return false;
  }
}

// ── Sizes, space, data use ──────────────────────────────────────────────────

const MB = 1024 * 1024;
/** Always leave this much free after a download — a full phone is a worse outcome than a refused download. */
export const FREE_SPACE_HEADROOM = 50 * MB;
/** Over this on mobile data → ask first. */
export const CELLULAR_CONFIRM_BYTES = 25 * MB;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / MB;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function bundleBytes(b: Pick<OfflineBundle, "content_bytes" | "files">): number {
  return Math.max(0, b.content_bytes || 0) + b.files.reduce((n, f) => n + Math.max(0, f.bytes || 0), 0);
}

/** `freeBytes` null = the OS wouldn't say; don't block on a number we don't have. */
export function hasRoomFor(neededBytes: number, freeBytes: number | null): boolean {
  if (freeBytes === null || !Number.isFinite(freeBytes)) return true;
  return freeBytes - neededBytes >= FREE_SPACE_HEADROOM;
}

export function needsCellularConfirm(totalBytes: number, connectionType: string | null | undefined): boolean {
  return connectionType === "cellular" && totalBytes > CELLULAR_CONFIRM_BYTES;
}

/** 0..1, never past 0.99 until the download is actually committed, so a full bar always means "saved". */
export function overallProgress(doneBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0;
  return Math.min(0.99, Math.max(0, doneBytes / totalBytes));
}

// ── File names ──────────────────────────────────────────────────────────────

/** A storage object's last path segment → something safe to use as a local file name (no separators, no dot-dot). */
export function safeFileName(name: string, fallback = "file"): string {
  const cleaned = name
    .replace(/^.*[\\/]/, "")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/**
 * Safe, distinct local names for a project's files. A project can hold two uploads with the same name ("take.wav"
 * twice); saved side by side in one folder the second would overwrite the first, so later ones are numbered.
 */
export function uniqueFileNames<T extends { name: string }>(files: T[]): T[] {
  const seen = new Set<string>();
  return files.map((file) => {
    const safe = safeFileName(file.name);
    const dot = safe.lastIndexOf(".");
    const base = dot > 0 ? safe.slice(0, dot) : safe;
    const ext = dot > 0 ? safe.slice(dot) : "";
    let name = safe;
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${base}-${n}${ext}`;
    seen.add(name.toLowerCase());
    return { ...file, name };
  });
}

// ── Versions & how a saved project opens ────────────────────────────────────

/** Both known and different. An unknown version on either side is never "stale" — don't nag about what we can't compare. */
export function isStaleVersion(local: string | null | undefined, remote: string | null | undefined): boolean {
  return !!local && !!remote && local !== remote;
}

export type LibraryTabKey = "books" | "courses" | "media" | "files";

export function libraryTabForType(projectType: string): LibraryTabKey {
  switch (projectType) {
    case "course":
      return "courses";
    case "media":
      return "media";
    case "file":
      return "files";
    default:
      return "books";
  }
}

export type OpenMode = "reader" | "viewer";

/**
 * How tapping a saved project in the Library opens it.
 *  - Authored books and courses use the normal reader screens (their text is seeded into the query cache), so they
 *    behave exactly as when online, including picking up newer content when there is a connection.
 *  - Anything stored as a file (uploaded book, file, audio/video/image) opens straight from the device copy.
 */
export function openModeFor(entry: { hasFiles: boolean }): OpenMode {
  return entry.hasFiles ? "viewer" : "reader";
}

// ── Library: the server's list + what's on this device ──────────────────────

export interface LibraryLikeItem {
  projectId: string;
  projectType: string;
  title: string;
  thumbnailUrl: string | null;
  status: string;
  acquiredVia: "purchased" | "free";
  acquiredAt: string;
}

interface SavedLike {
  projectId: string;
  projectType: string;
  title: string;
  thumbnailUrl: string | null;
  acquiredVia: "purchased" | "free" | "owner";
  downloadedAt: number;
}

/**
 * The Library list with saved copies folded in. The server's list wins for anything it knows (it has the real
 * acquisition date and archive status); a saved copy the list doesn't have — because we're offline, or a free
 * project's access event hasn't landed — is added from the device's own record so it's never missing from the
 * place we just sent the person to. Newest first.
 */
export function mergeLibraryWithDownloads<T extends LibraryLikeItem>(remote: T[] | undefined, saved: SavedLike[] | undefined): T[] {
  const byId = new Map<string, T>();
  for (const item of remote ?? []) byId.set(item.projectId, item);
  for (const s of saved ?? []) {
    if (byId.has(s.projectId)) continue;
    byId.set(s.projectId, {
      projectId: s.projectId,
      projectType: s.projectType,
      title: s.title,
      thumbnailUrl: s.thumbnailUrl,
      status: "active",
      acquiredVia: s.acquiredVia === "purchased" ? "purchased" : "free",
      acquiredAt: new Date(s.downloadedAt).toISOString(),
    } as T);
  }
  return Array.from(byId.values()).sort((a, b) => new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime());
}

/**
 * Where a saved text project opens (the same screens the Read / Start buttons use). Authored books read at /books/:id,
 * an uploaded PDF's extracted chapters at /projects/:id/read (which also decides reflow vs. page reader), courses at /courses/:id.
 */
export function offlineReaderRoute(projectType: string, projectId: string, contentSource?: string | null): string {
  if (projectType === "course") return `/courses/${projectId}`;
  if (projectType === "book" && contentSource === "upload") return `/projects/${projectId}/read`;
  return `/books/${projectId}`;
}
