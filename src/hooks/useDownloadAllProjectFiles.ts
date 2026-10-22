// src/hooks/useDownloadAllProjectFiles.ts
// "Download all" for a multi-file File project — as ONE zip, or as separate files. (A single file is
// useDownloadProjectFile; this is its batch sibling.) Same rules as there:
//   1. get-project-file { all: true } checks access ONCE, opens ONE download attempt and returns every file's signed
//      URL with its final name (the creator's slot title, else the uploaded file's own name; duplicates made unique).
//   2. Files are handled ONE AT A TIME so the device never holds more than one temp copy: download it to disk (size
//      on disk must match Content-Length), then either append it to the zip being written, or copy it into the folder
//      the person picked, then delete the temp copy.
//   3. Only if EVERY file arrived is the attempt completed (complete_file_download): the whole batch counts as a
//      single download and the creator gets a single notification. Cancelled/interrupted → counts for nothing.
//   4. A zip then opens the system share/save sheet (like a single file does); "one by one" has already written the
//      files into the folder the person chose, so there is nothing more to do.
//
// The zip is built here (fflate, store-only: uploads are usually already compressed, and storing keeps the JS thread
// quick). fflate writes plain ZIP, whose 32-bit offsets cap an archive at 4GB, so bigger batches are offered one by one only.
import { Directory, File as FsFile, FileMode, type FileHandle } from "expo-file-system";
import * as LegacyFs from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Zip, ZipPassThrough } from "fflate";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ZIP_MAX_BYTES } from "@/lib/fileProject";
import { supabase } from "../lib/supabase";
import { DownloadCancelledError } from "./useDownloadProjectFile";

export type DownloadAllMode = "zip" | "each";

interface DownloadAllArgs {
  projectId: string;
  /** Names the zip ("<title>.zip"). */
  title: string;
  mode: DownloadAllMode;
}

interface BatchFile {
  file_id: string | null;
  url: string;
  file_name: string;
  size_bytes: number | null;
}

// Same cache folder as single downloads, same "<timestamp>-" prefix, so the one sweeper there clears stale leftovers.
const DOWNLOAD_DIR = "project-downloads/";
const STALE_AFTER_MS = 15 * 60 * 1000;
const COPY_CHUNK_BYTES = 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf", zip: "application/zip", txt: "text/plain", csv: "text/csv", json: "application/json",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg",
  mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", webm: "video/webm",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function mimeFor(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 150) || "download";
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : null;
}

async function prepareDownloadDir(): Promise<string> {
  const dir = `${LegacyFs.cacheDirectory}${DOWNLOAD_DIR}`;
  await LegacyFs.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined); // already exists
  try {
    const now = Date.now();
    for (const name of await LegacyFs.readDirectoryAsync(dir)) {
      const stamp = Number(name.split("-")[0]);
      if (!Number.isFinite(stamp) || now - stamp > STALE_AFTER_MS) {
        await LegacyFs.deleteAsync(`${dir}${name}`, { idempotent: true });
      }
    }
  } catch {
    /* sweeping is best-effort */
  }
  return dir;
}

/** Lets the UI breathe between chunks — zipping runs on the JS thread. */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Streams `src` (a finished temp download) into `consume`, one chunk at a time, then closes it. */
async function readInChunks(src: FsFile, consume: (chunk: Uint8Array) => void | Promise<void>): Promise<void> {
  const total = src.size;
  const handle: FileHandle = src.open(FileMode.ReadOnly);
  try {
    let read = 0;
    while (read < total) {
      const chunk = handle.readBytes(Math.min(COPY_CHUNK_BYTES, total - read));
      if (chunk.length === 0) break;
      read += chunk.length;
      await consume(chunk);
      await yieldToUi();
    }
  } finally {
    handle.close();
  }
}

export function useDownloadAllProjectFiles() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  /** "File 2 of 4" while a batch runs. */
  const [status, setStatus] = useState<string | null>(null);
  const taskRef = useRef<LegacyFs.DownloadResumable | null>(null);
  const cancelledRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async ({ projectId, title, mode }: DownloadAllArgs): Promise<number> => {
      cancelledRef.current = false;

      // Decide where the files go BEFORE any network work.
      let folder: Directory | null = null;
      if (mode === "each") {
        try {
          folder = await Directory.pickDirectoryAsync();
        } catch {
          throw new DownloadCancelledError(); // dismissed the folder picker
        }
      } else if (!(await Sharing.isAvailableAsync())) {
        throw new Error("This device can't save files from Akọ.");
      }

      setProgress(0);
      setStatus("Preparing…");
      const tempUris: string[] = [];
      let zipFile: FsFile | null = null;
      let zipHandle: FileHandle | null = null;
      let zipFinished = false;
      try {
        const { data, error } = await supabase.functions.invoke("get-project-file", {
          body: { project_id: projectId, kind: "file", action: "download", all: true },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const files: BatchFile[] = Array.isArray(data?.files) ? data.files : [];
        const downloadId: string | null = data?.download_id ?? null;
        if (files.length === 0) throw new Error("This project has no files to download.");
        if (cancelledRef.current) throw new DownloadCancelledError();

        const knownTotal = files.every((f) => f.size_bytes && f.size_bytes > 0)
          ? files.reduce((sum, f) => sum + (f.size_bytes ?? 0), 0)
          : 0;
        if (mode === "zip" && knownTotal > ZIP_MAX_BYTES) {
          throw new Error("These files add up to more than 4 GB, too big for one zip. Download them one by one instead.");
        }

        const dir = await prepareDownloadDir();
        const stamp = Date.now();

        const zip = new Zip();
        let zipError: unknown = null;
        let zipBytes = 0;
        if (mode === "zip") {
          zipFile = new FsFile(`${dir}${stamp}-${safeName(title)}.zip`);
          zipFile.create({ overwrite: true });
          zipHandle = zipFile.open(FileMode.WriteOnly);
          zip.ondata = (err, chunk) => {
            if (err) {
              zipError = err;
              return;
            }
            zipBytes += chunk.length;
            if (zipBytes > ZIP_MAX_BYTES) {
              zipError = new Error("These files are too big for one zip. Download them one by one instead.");
              return;
            }
            zipHandle?.writeBytes(chunk);
          };
        }

        let doneBytes = 0;
        for (let i = 0; i < files.length; i++) {
          if (cancelledRef.current) throw new DownloadCancelledError();
          const file = files[i];
          const name = safeName(file.file_name);
          setStatus(`File ${i + 1} of ${files.length}`);

          // 1. This file onto the device.
          const dest = `${dir}${stamp}-${i}-${name}`;
          tempUris.push(dest);
          const task = LegacyFs.createDownloadResumable(file.url, dest, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
            if (knownTotal) setProgress(Math.min(99, Math.floor(((doneBytes + totalBytesWritten) / knownTotal) * 100)));
            else if (totalBytesExpectedToWrite > 0) {
              setProgress(Math.min(99, Math.floor(((i + totalBytesWritten / totalBytesExpectedToWrite) / files.length) * 100)));
            }
          });
          taskRef.current = task;
          const result = await task.downloadAsync();
          taskRef.current = null;
          if (cancelledRef.current) throw new DownloadCancelledError();
          if (!result || result.status !== 200) throw new Error(`Couldn't download "${file.file_name}". Please try again.`);

          // Whole-file check, as for a single download: bytes on disk must equal what the server said it sent (a
          // compressed response is stored decoded, so there the only check is that something arrived).
          const compressed = !!headerValue(result.headers, "content-encoding");
          const expected = compressed ? 0 : Number(headerValue(result.headers, "content-length")) || 0;
          const info = await LegacyFs.getInfoAsync(result.uri);
          const received = info.exists && "size" in info ? info.size : 0;
          if (!info.exists || received === 0 || (expected && received !== expected)) {
            throw new Error(`"${file.file_name}" was interrupted. Please try again.`);
          }
          doneBytes += received;

          // 2. Into the zip, or into the chosen folder — then the temp copy goes.
          const src = new FsFile(dest);
          if (mode === "zip") {
            const entry = new ZipPassThrough(name);
            zip.add(entry);
            await readInChunks(src, (chunk) => {
              entry.push(chunk);
              if (zipError) throw zipError;
            });
            entry.push(new Uint8Array(0), true);
            if (zipError) throw zipError;
          } else {
            const out = folder!.createFile(name, mimeFor(name));
            const outHandle = out.open(FileMode.WriteOnly);
            try {
              await readInChunks(src, (chunk) => outHandle.writeBytes(chunk));
            } finally {
              outHandle.close();
            }
          }
          src.delete();
        }

        if (mode === "zip") {
          zip.end();
          if (zipError) throw zipError;
          zipHandle?.close();
          zipHandle = null;
          zipFinished = true;
        }

        // Every file of the batch is on the device → now (and only now) it counts, once.
        if (downloadId) {
          const { error: completeError } = await supabase.rpc("complete_file_download", {
            p_download_id: downloadId,
            p_bytes: doneBytes,
          });
          if (completeError) console.warn("complete_file_download failed:", completeError);
        }
        setProgress(100);

        if (mode === "zip" && zipFile) {
          await Sharing.shareAsync(zipFile.uri, {
            mimeType: "application/zip",
            UTI: "public.zip-archive",
            dialogTitle: `${safeName(title)}.zip`,
          });
        }
        return files.length;
      } catch (err) {
        // Nothing counted, nothing worth keeping: don't leave partial files behind.
        try {
          zipHandle?.close();
        } catch {
          /* already closed */
        }
        if (zipFile && !zipFinished) await LegacyFs.deleteAsync(zipFile.uri, { idempotent: true }).catch(() => undefined);
        for (const uri of tempUris) await LegacyFs.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        // The native task may report a cancel as an ordinary failure; to the person it is still just a cancel.
        if (cancelledRef.current && !(err instanceof DownloadCancelledError)) throw new DownloadCancelledError();
        throw err;
      } finally {
        taskRef.current = null;
        setTimeout(() => {
          setProgress(null);
          setStatus(null);
        }, 800);
      }
    },
    onSuccess: (_count, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["project"] });
      void queryClient.invalidateQueries({ queryKey: ["project-detail", vars.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["resolve-project-slug"] });
      void queryClient.invalidateQueries({ queryKey: ["page-projects"] });
      void queryClient.invalidateQueries({ queryKey: ["user-projects"] });
    },
  });

  /** Stops an in-flight batch. Safe to call at any time; a cancelled batch never counts. */
  const cancel = () => {
    cancelledRef.current = true;
    void taskRef.current?.cancelAsync().catch(() => undefined);
  };

  return Object.assign(mutation, { progress, status, cancel });
}
