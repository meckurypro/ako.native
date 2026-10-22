// src/lib/offlineStore.ts
//
// "Download to library": keep a book / course / file / media project on the device so it opens with no network.
// Nothing goes to the phone's Downloads folder — it lives in the app's own storage and is listed in the Library.
//
//   index + text   encrypted SQLite (lib/secureDb.ts, SQLCipher)         table: offline_projects
//   big files      <documents>/offline/<userId>/<projectId>/<file name>  (app sandbox; hosted PDFs, audio, video, images)
//
// Why a separate table instead of secureDb's kv_cache: wipeSecureCache() empties kv_cache on sign-out, and a download is
// something the person chose to keep — it must not vanish because they signed out and back in. Every row and folder is
// keyed by user id, so another account on the same phone never sees it.
//
// Access is decided on the SERVER (get_project_offline_bundle → access + the host's allow_download choice; each hosted
// file still comes from the get-project-file edge function). This file never decides who may download — it only
// carries out an approved download safely: nothing is visible until every byte is on disk (files are written as
// `.part` and moved, the index row is the commit marker), a cancelled/failed download leaves nothing behind, and
// replacing an old copy never destroys it before the new one is complete.
import NetInfo from "@react-native-community/netinfo";
import { getRandomBytes } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import type { SQLiteDatabase } from "expo-sqlite";
import { useSyncExternalStore } from "react";

import type { Project } from "@/hooks/useProjects";
import { prefetchImagesFromData } from "./imageStore";
import {
  OfflineError,
  bundleBytes,
  hasRoomFor,
  isOfflineType,
  needsCellularConfirm,
  offlineErrorFromServer,
  overallProgress,
  safeFileName,
  uniqueFileNames,
  type OfflineBundle,
  type OfflineFileInfo,
} from "./offlineProjects";
import { queryClient } from "./queryClient";
import { getSecureDb } from "./secureDb";
import { supabase } from "./supabase";

// ── Types ───────────────────────────────────────────────────────────────────

export type AcquiredVia = "purchased" | "free" | "owner";

export interface OfflineEntry {
  userId: string;
  projectId: string;
  projectType: string;
  title: string;
  thumbnailUrl: string | null;
  acquiredVia: AcquiredVia;
  /** Content hash of what was saved (server-computed); compared with the server's to spot "update available". */
  version: string | null;
  bytes: number;
  downloadedAt: number;
  /** Whether the server's project_downloads record matches this copy. */
  synced: boolean;
  files: OfflineFileInfo[];
}

export type DownloadPhase = "idle" | "preparing" | "downloading" | "saving" | "failed";

export interface DownloadState {
  phase: DownloadPhase;
  /** 0..0.99 while running. */
  progress: number;
  receivedBytes: number;
  totalBytes: number;
  /** Set when phase is "failed". */
  error: OfflineError | null;
}

const IDLE: DownloadState = { phase: "idle", progress: 0, receivedBytes: 0, totalBytes: 0, error: null };

export const OFFLINE_ENTRIES_KEY = "offline-entries";

// ── Device id (so the server record can say which device holds a copy) ─────

const DEVICE_KEY = "ako.offline-device.v1";
let deviceIdPromise: Promise<string> | null = null;

function getDeviceId(): Promise<string> {
  deviceIdPromise ??= (async () => {
    try {
      const existing = await SecureStore.getItemAsync(DEVICE_KEY);
      if (existing && /^[0-9a-f]{32}$/.test(existing)) return existing;
    } catch {
      /* fall through and make one */
    }
    const id = Array.from(getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
    try {
      await SecureStore.setItemAsync(DEVICE_KEY, id, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    } catch {
      /* an id that doesn't persist still works for this session; reconcile just treats the next one as a new device */
    }
    return id;
  })();
  return deviceIdPromise;
}

// ── Encrypted index ─────────────────────────────────────────────────────────

let schemaReady = false;

async function openDb(): Promise<SQLiteDatabase> {
  const db = await getSecureDb();
  // No SQLCipher in this build → refuse rather than write paid content in the clear (secureDb fails closed too).
  if (!db) throw new OfflineError("storage_unavailable");
  if (!schemaReady) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS offline_projects (
        user_id       TEXT NOT NULL,
        project_id    TEXT NOT NULL,
        project_type  TEXT NOT NULL,
        title         TEXT NOT NULL,
        thumbnail_url TEXT,
        acquired_via  TEXT NOT NULL,
        version       TEXT,
        bytes         INTEGER NOT NULL,
        downloaded_at INTEGER NOT NULL,
        synced        INTEGER NOT NULL DEFAULT 0,
        project_json  TEXT NOT NULL,
        details_json  TEXT,
        content_json  TEXT,
        files_json    TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (user_id, project_id)
      ) WITHOUT ROWID;
    `);
    schemaReady = true;
  }
  return db;
}

interface Row {
  user_id: string;
  project_id: string;
  project_type: string;
  title: string;
  thumbnail_url: string | null;
  acquired_via: string;
  version: string | null;
  bytes: number;
  downloaded_at: number;
  synced: number;
  files_json: string;
}

const ENTRY_COLUMNS = "user_id, project_id, project_type, title, thumbnail_url, acquired_via, version, bytes, downloaded_at, synced, files_json";

function parseFiles(json: string): OfflineFileInfo[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as OfflineFileInfo[]) : [];
  } catch {
    return [];
  }
}

function toEntry(r: Row): OfflineEntry {
  return {
    userId: r.user_id,
    projectId: r.project_id,
    projectType: r.project_type,
    title: r.title,
    thumbnailUrl: r.thumbnail_url,
    acquiredVia: r.acquired_via === "purchased" || r.acquired_via === "owner" ? r.acquired_via : "free",
    version: r.version,
    bytes: r.bytes,
    downloadedAt: r.downloaded_at,
    synced: r.synced === 1,
    files: parseFiles(r.files_json),
  };
}

/** Everything this account has saved on this device, newest first. Works with no network. */
export async function listOfflineEntries(userId: string): Promise<OfflineEntry[]> {
  const db = await getSecureDb();
  if (!db) return [];
  await openDb();
  const rows = await db.getAllAsync<Row>(`SELECT ${ENTRY_COLUMNS} FROM offline_projects WHERE user_id = ? ORDER BY downloaded_at DESC;`, [userId]);
  return rows.map(toEntry);
}

export async function getOfflineEntry(userId: string, projectId: string): Promise<OfflineEntry | null> {
  const db = await getSecureDb();
  if (!db) return null;
  await openDb();
  const row = await db.getFirstAsync<Row>(`SELECT ${ENTRY_COLUMNS} FROM offline_projects WHERE user_id = ? AND project_id = ?;`, [userId, projectId]);
  return row ? toEntry(row) : null;
}

function notifyEntriesChanged() {
  void queryClient.invalidateQueries({ queryKey: [OFFLINE_ENTRIES_KEY] });
}

// ── Local files ─────────────────────────────────────────────────────────────

const rootDir = () => new Directory(Paths.document, "offline");
const userDir = (userId: string) => new Directory(rootDir(), safeFileName(userId, "user"));
const projectDir = (userId: string, projectId: string) => new Directory(userDir(userId), safeFileName(projectId, "project"));

/** The on-device copy of one of a project's files, or null if it isn't there (never downloaded, or the OS purged it). */
export function offlineFileUri(entry: Pick<OfflineEntry, "userId" | "projectId">, file: Pick<OfflineFileInfo, "name">): string | null {
  try {
    const f = new File(projectDir(entry.userId, entry.projectId), safeFileName(file.name));
    return f.exists && (f.size ?? 0) > 0 ? f.uri : null;
  } catch {
    return null;
  }
}

function removeDir(dir: Directory) {
  try {
    if (dir.exists) dir.delete();
  } catch {
    /* best-effort: an undeletable folder is retried by the next orphan sweep */
  }
}

// ── Download state (shared, so the menu, the sheet and the Library always agree) ──

const states = new Map<string, DownloadState>();
const controllers = new Map<string, AbortController>();
const inflight = new Map<string, Promise<OfflineEntry>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

function setState(projectId: string, next: DownloadState) {
  if (next.phase === "idle") states.delete(projectId);
  else states.set(projectId, next);
  emit();
}

export function getDownloadState(projectId: string): DownloadState {
  return states.get(projectId) ?? IDLE;
}

/** Live state of one project's download (idle when nothing is running). */
export function useDownloadState(projectId: string | undefined): DownloadState {
  return useSyncExternalStore(subscribe, () => (projectId ? (states.get(projectId) ?? IDLE) : IDLE));
}

/** Forget a failed attempt's message (e.g. when its sheet is dismissed). */
export function clearDownloadState(projectId: string) {
  if (states.get(projectId)?.phase === "failed") setState(projectId, IDLE);
}

export function cancelOfflineDownload(projectId: string) {
  controllers.get(projectId)?.abort();
}

// ── Download ────────────────────────────────────────────────────────────────

export interface StartOptions {
  userId: string;
  projectId: string;
  acquiredVia: AcquiredVia;
  /** The person already agreed to a large download on mobile data. */
  confirmedCellular?: boolean;
}

const looksOffline = (msg: string | undefined) => !!msg && /network request failed|failed to fetch|network error|timed out|offline/i.test(msg);

async function fetchBundle(projectId: string): Promise<OfflineBundle> {
  const { data, error } = await supabase.rpc("get_project_offline_bundle", { p_project_id: projectId, p_include_content: true });
  if (error) throw looksOffline(error.message) ? new OfflineError("offline") : offlineErrorFromServer(error.message);
  const bundle = data as OfflineBundle | null;
  if (!bundle || !isOfflineType(bundle.project_type)) throw new OfflineError("not_downloadable");
  return { ...bundle, files: uniqueFileNames(bundle.files ?? []) };
}

async function fetchProjectRow(projectId: string): Promise<Project> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).single();
  if (error || !data) throw looksOffline(error?.message) ? new OfflineError("offline") : new OfflineError("access_denied");
  return data as Project;
}

async function signedUrlFor(projectId: string, file: OfflineFileInfo): Promise<string> {
  const { data, error } = await supabase.functions.invoke("get-project-file", { body: { project_id: projectId, kind: file.kind, action: "download", ...(file.file_id ? { file_id: file.file_id } : {}) } });
  if (error || data?.error || typeof data?.url !== "string") {
    // The server re-checks access here too (and the host's allow_download for uploaded books).
    throw looksOffline(error?.message) ? new OfflineError("offline") : new OfflineError("download_not_allowed");
  }
  return data.url as string;
}

/** Starts (or joins) the download of one project. Resolves with the saved entry; rejects with an OfflineError. */
export function startOfflineDownload(opts: StartOptions): Promise<OfflineEntry> {
  const running = inflight.get(opts.projectId);
  if (running) return running;

  const controller = new AbortController();
  controllers.set(opts.projectId, controller);
  setState(opts.projectId, { phase: "preparing", progress: 0, receivedBytes: 0, totalBytes: 0, error: null });

  const job = (async (): Promise<OfflineEntry> => {
    const { userId, projectId } = opts;
    const stage = new Directory(userDir(userId), `.tmp-${safeFileName(projectId, "project")}-${Date.now()}`);
    const finalDir = projectDir(userId, projectId);
    let movedIntoPlace = false;
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected || net.isInternetReachable === false) throw new OfflineError("offline");

      const db = await openDb();
      const [project, bundle] = await Promise.all([fetchProjectRow(projectId), fetchBundle(projectId)]);
      if (controller.signal.aborted) throw new OfflineError("cancelled");

      const total = bundleBytes(bundle);
      let free: number | null = null;
      try {
        free = Paths.availableDiskSpace;
      } catch {
        free = null;
      }
      if (!hasRoomFor(total, free)) throw new OfflineError("no_space", total);
      if (!opts.confirmedCellular && needsCellularConfirm(total, net.type)) throw new OfflineError("needs_confirmation", total);

      // The text (chapters / lessons) is already in hand — it counts as done and the bar moves for the files.
      const textBytes = Math.max(0, bundle.content_bytes || 0);
      let received = textBytes;
      const fileBytesTotal = bundle.files.reduce((n, f) => n + Math.max(0, f.bytes || 0), 0);
      setState(projectId, { phase: "downloading", progress: overallProgress(received, total), receivedBytes: received, totalBytes: total, error: null });

      // ── Files → a staging folder, one `.part` at a time, moved into place only when complete ──
      if (bundle.files.length > 0) {
        stage.create({ intermediates: true, idempotent: true });
        let lastEmitted = 0;
        for (let i = 0; i < bundle.files.length; i++) {
          const file = bundle.files[i];
          const url = await signedUrlFor(projectId, file);
          if (controller.signal.aborted) throw new OfflineError("cancelled");
          const name = safeFileName(file.name, `${file.kind}-${i}`);
          const part = new File(stage, `${name}.part`);
          const doneBefore = received;
          await File.downloadFileAsync(url, part, {
            idempotent: true,
            signal: controller.signal,
            onProgress: ({ bytesWritten, totalBytes }) => {
              const expected = file.bytes > 0 ? file.bytes : totalBytes > 0 ? totalBytes : 0;
              const written = expected > 0 ? Math.min(bytesWritten, expected) : bytesWritten;
              // Sizes the server couldn't report: spread the bar evenly over the files instead of freezing it.
              const pct =
                fileBytesTotal > 0
                  ? overallProgress(doneBefore + written, total)
                  : Math.min(0.99, (i + (expected > 0 ? written / expected : 0)) / bundle.files.length);
              if (pct - lastEmitted >= 0.01) {
                lastEmitted = pct;
                setState(projectId, { phase: "downloading", progress: pct, receivedBytes: doneBefore + written, totalBytes: total, error: null });
              }
            },
          });
          const size = part.size ?? 0;
          if (size <= 0 || (file.bytes > 0 && size < file.bytes)) throw new OfflineError("failed"); // truncated → don't keep it
          const done = new File(stage, name);
          if (done.exists) done.delete();
          part.move(done);
          received = doneBefore + (file.bytes > 0 ? file.bytes : size);
        }
      }

      if (controller.signal.aborted) throw new OfflineError("cancelled");
      setState(projectId, { phase: "saving", progress: 0.99, receivedBytes: received, totalBytes: total, error: null });

      // ── Put the files in their final folder (replacing an older copy), then commit the row last ──
      if (bundle.files.length > 0) {
        removeDir(finalDir);
        finalDir.create({ intermediates: true, idempotent: true });
        for (let i = 0; i < bundle.files.length; i++) {
          const name = safeFileName(bundle.files[i].name, `${bundle.files[i].kind}-${i}`);
          new File(stage, name).move(new File(finalDir, name));
        }
        movedIntoPlace = true;
      }
      removeDir(stage);

      const storedFiles = bundle.files.map((f, i) => ({ ...f, name: safeFileName(f.name, `${f.kind}-${i}`) }));
      const entry: OfflineEntry = {
        userId,
        projectId,
        projectType: project.project_type,
        title: project.title,
        thumbnailUrl: project.thumbnail_url ?? null,
        acquiredVia: bundle.is_owner ? "owner" : opts.acquiredVia,
        version: bundle.version,
        bytes: total,
        downloadedAt: Date.now(),
        synced: false,
        files: storedFiles,
      };
      await db.runAsync(
        `INSERT OR REPLACE INTO offline_projects
           (user_id, project_id, project_type, title, thumbnail_url, acquired_via, version, bytes, downloaded_at, synced, project_json, details_json, content_json, files_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?);`,
        [
          entry.userId,
          entry.projectId,
          entry.projectType,
          entry.title,
          entry.thumbnailUrl,
          entry.acquiredVia,
          entry.version,
          entry.bytes,
          entry.downloadedAt,
          JSON.stringify(project),
          bundle.details ? JSON.stringify(bundle.details) : null,
          bundle.content ? JSON.stringify(bundle.content) : null,
          JSON.stringify(storedFiles),
        ]
      );

      // Best-effort extras: none of these may fail the download, which is already safely saved.
      prefetchImagesFromData({ thumbnail_url: project.thumbnail_url, supporting_image_urls: project.supporting_image_urls });
      void recordOnServer(entry);
      await seedOfflineQueries(userId, projectId);
      notifyEntriesChanged();
      setState(projectId, IDLE);
      return entry;
    } catch (e) {
      removeDir(stage);
      // A copy that was moved into place but never committed to the index would be an orphan on disk.
      if (movedIntoPlace) removeDir(finalDir);
      const err =
        controller.signal.aborted || (e instanceof OfflineError && e.code === "cancelled")
          ? new OfflineError("cancelled")
          : e instanceof OfflineError
            ? e
            : looksOffline(e instanceof Error ? e.message : undefined)
              ? new OfflineError("offline")
              : new OfflineError("failed");
      // Cancelling or being asked to confirm isn't a failure to display; only real errors keep a message on screen.
      setState(projectId, err.code === "cancelled" || err.code === "needs_confirmation" ? IDLE : { phase: "failed", progress: 0, receivedBytes: 0, totalBytes: 0, error: err });
      throw err;
    } finally {
      inflight.delete(projectId);
      controllers.delete(projectId);
    }
  })();

  inflight.set(opts.projectId, job);
  job.catch(() => {}); // outcomes are reported through state; callers that don't await mustn't crash on a rejection
  return job;
}

// ── Remove ──────────────────────────────────────────────────────────────────

export async function removeOfflineProject(userId: string, projectId: string): Promise<void> {
  cancelOfflineDownload(projectId);
  const db = await getSecureDb();
  if (db) {
    await openDb();
    await db.runAsync("DELETE FROM offline_projects WHERE user_id = ? AND project_id = ?;", [userId, projectId]);
  }
  removeDir(projectDir(userId, projectId));
  notifyEntriesChanged();
  // The server record is reconciled the next time we're online (see reconcileOfflineRecords) if this can't reach it now.
  void deleteOnServer(userId, projectId);
}

/** Everything saved by one account on this device (e.g. a "free up space" action, or account removal). */
export async function removeAllOfflineProjects(userId: string): Promise<void> {
  const entries = await listOfflineEntries(userId);
  for (const e of entries) await removeOfflineProject(userId, e.projectId);
  removeDir(userDir(userId));
}

// ── Reading back ────────────────────────────────────────────────────────────

interface StoredContent {
  project: Project;
  /** project_book_details / project_media_details row, when the project type has one. */
  details: Record<string, unknown> | null;
  content: { chapters?: unknown[]; modules?: unknown[] } | null;
}

export async function readOfflineContent(userId: string, projectId: string): Promise<StoredContent | null> {
  const db = await getSecureDb();
  if (!db) return null;
  await openDb();
  const row = await db.getFirstAsync<{ project_json: string; details_json: string | null; content_json: string | null }>(
    "SELECT project_json, details_json, content_json FROM offline_projects WHERE user_id = ? AND project_id = ?;",
    [userId, projectId]
  );
  if (!row) return null;
  try {
    return {
      project: JSON.parse(row.project_json) as Project,
      details: row.details_json ? JSON.parse(row.details_json) : null,
      content: row.content_json ? JSON.parse(row.content_json) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Puts a saved project's data into React Query's cache under the SAME keys the online screens read, so the ordinary
 * Book / Course screens open it with no changes and no network. With a connection, those queries simply refetch and
 * replace this with the live copy. Safe to call repeatedly.
 */
export async function seedOfflineQueries(userId: string, projectId: string): Promise<boolean> {
  const saved = await readOfflineContent(userId, projectId);
  if (!saved) return false;
  const { project, details, content } = saved;
  // Only fill what's EMPTY: if the live query already has data (we're online and it loaded), that's fresher than this.
  const seed = (key: unknown[], value: unknown) => {
    if (queryClient.getQueryData(key) === undefined) queryClient.setQueryData(key, value);
  };
  seed(["project", projectId], project);
  // BookRead (and the media players) read these before they render anything; without them an offline book would sit on "Loading…".
  if (details) seed([project.project_type === "media" ? "project-media-details" : "project-book-details", projectId], details);
  if (content?.chapters) seed(["book-chapters", projectId], content.chapters);
  if (content?.modules) seed(["course-modules", projectId], content.modules);
  const entry = await getOfflineEntry(userId, projectId);
  // The screens gate on "do I have access?"; the server already said yes when this was saved. Without these, a paid
  // project (or a private one) would read as locked while offline because those checks can't run.
  if (entry?.acquiredVia === "purchased") seed(["has-purchased", projectId, userId], true);
  if (project.is_private) seed(["is-project-member", projectId, userId], true);
  return true;
}

// ── Server bookkeeping (best-effort; never blocks or fails a download) ──────

async function recordOnServer(entry: OfflineEntry): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const { error } = await supabase.from("project_downloads").upsert(
      {
        user_id: entry.userId,
        project_id: entry.projectId,
        device_id: deviceId,
        content_version: entry.version ?? "",
        bytes: entry.bytes,
        downloaded_at: new Date(entry.downloadedAt).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,project_id,device_id" }
    );
    if (error) return; // stays synced = 0; reconcileOfflineRecords retries
    const db = await getSecureDb();
    await db?.runAsync("UPDATE offline_projects SET synced = 1 WHERE user_id = ? AND project_id = ?;", [entry.userId, entry.projectId]);
  } catch {
    /* offline: reconciled later */
  }
}

async function deleteOnServer(userId: string, projectId: string): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await supabase.from("project_downloads").delete().eq("user_id", userId).eq("project_id", projectId).eq("device_id", deviceId);
  } catch {
    /* offline: reconciled later */
  }
}

/**
 * Makes the server's record of THIS device match what's actually on it: upserts copies it hasn't heard about,
 * deletes records for copies that were removed while offline. Cheap; call when the Library opens with a connection.
 */
export async function reconcileOfflineRecords(userId: string): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    const [entries, remote] = await Promise.all([
      listOfflineEntries(userId),
      supabase.from("project_downloads").select("project_id").eq("user_id", userId).eq("device_id", deviceId),
    ]);
    if (remote.error) return;
    const local = new Set(entries.map((e) => e.projectId));
    const onServer = new Set((remote.data ?? []).map((r) => r.project_id as string));
    for (const e of entries) if (!e.synced || !onServer.has(e.projectId)) await recordOnServer(e);
    for (const pid of onServer) if (!local.has(pid)) await deleteOnServer(userId, pid);
  } catch {
    /* try again next time */
  }
}

/** Server's current content version per project (only ones this person can still access are returned). */
export async function fetchRemoteVersions(projectIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (projectIds.length === 0) return out;
  try {
    const { data, error } = await supabase.rpc("get_project_offline_versions", { p_project_ids: projectIds.slice(0, 100) });
    if (error) return out;
    for (const r of (data ?? []) as { project_id: string; version: string | null }[]) if (r.version) out.set(r.project_id, r.version);
  } catch {
    /* offline: no update info, which is fine */
  }
  return out;
}

// ── Housekeeping ────────────────────────────────────────────────────────────

/** Removes folders with no index row (a download killed mid-way) and stale staging folders. Safe to call any time. */
export async function sweepOfflineOrphans(userId: string): Promise<void> {
  try {
    const dir = userDir(userId);
    if (!dir.exists) return;
    const known = new Set((await listOfflineEntries(userId)).map((e) => safeFileName(e.projectId, "project")));
    for (const item of dir.list()) {
      if (!(item instanceof Directory)) continue;
      const name = item.name;
      if (name.startsWith(".tmp-") ? !inflight.size : !known.has(name)) removeDir(item);
    }
  } catch {
    /* housekeeping only */
  }
}
