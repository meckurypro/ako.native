// src/hooks/useDownloadProjectFile.ts
// Downloads a File project's hosted file onto the device and only counts it once the WHOLE file has arrived:
//   1. get-project-file checks access, opens a download attempt (download_id) and returns a signed URL.
//   2. The file streams to disk (never into memory) with progress; its size on disk must match Content-Length.
//   3. Only then is the attempt completed (complete_file_download): that bumps the project's download_count and
//      notifies the creator. A cancelled/interrupted download counts for nothing.
//   4. The system share/save sheet opens so the person can keep it in Files / open it with another app.
// `cancel()` aborts at any point before step 3 (the web app's equivalent is dismissing the save dialog).
import * as LegacyFs from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../lib/supabase";

interface DownloadArgs {
  projectId: string;
  /** Used to name the saved file (title + the stored file's extension). */
  title: string;
  filePath: string | null;
}

export class DownloadCancelledError extends Error {
  constructor() {
    super("Download cancelled");
    this.name = "DownloadCancelledError";
  }
}

// Downloads live in their own cache folder so old ones can be swept without touching anything else. Android's
// share sheet reads the file *after* shareAsync resolves, so a finished download can't be deleted right away —
// it is cleared the next time a download starts instead (and the OS reclaims the cache on its own too).
const DOWNLOAD_DIR = "project-downloads/";
const STALE_AFTER_MS = 15 * 60 * 1000;

function suggestedFileName(title: string, filePath: string | null): string {
  const ext = filePath && filePath.includes(".") ? filePath.split(".").pop() : null;
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").slice(0, 80) || "download";
  return ext ? `${base}.${ext}` : base;
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

export function useDownloadProjectFile() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const taskRef = useRef<LegacyFs.DownloadResumable | null>(null);
  const cancelledRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async ({ projectId, title, filePath }: DownloadArgs): Promise<number | null> => {
      cancelledRef.current = false;
      const fileName = suggestedFileName(title, filePath);

      // Find out up front: no point streaming a file the device then has no way to hand to the person.
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("This device can't save files from Akọ.");
      }

      setProgress(0);
      let dest: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke("get-project-file", {
          body: { project_id: projectId, kind: "file", action: "download" },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const url: string = data.url;
        const downloadId: string | null = data.download_id ?? null;
        if (cancelledRef.current) throw new DownloadCancelledError();

        const dir = await prepareDownloadDir();
        dest = `${dir}${Date.now()}-${fileName}`;
        const task = LegacyFs.createDownloadResumable(url, dest, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            setProgress(Math.min(99, Math.floor((totalBytesWritten / totalBytesExpectedToWrite) * 100)));
          }
        });
        taskRef.current = task;
        const result = await task.downloadAsync();
        taskRef.current = null;
        if (cancelledRef.current) throw new DownloadCancelledError();
        if (!result || result.status !== 200) throw new Error("Download failed — please try again.");

        // Whole-file check: bytes on disk must equal what the server said it was sending. A compressed response
        // (Content-Encoding) is stored decoded, so its size legitimately differs from Content-Length — there the
        // only thing that can be checked is that something arrived.
        const compressed = !!headerValue(result.headers, "content-encoding");
        const expected = compressed ? 0 : Number(headerValue(result.headers, "content-length")) || 0;
        const info = await LegacyFs.getInfoAsync(result.uri);
        const received = info.exists && "size" in info ? info.size : 0;
        if (!info.exists || received === 0 || (expected && received !== expected)) {
          throw new Error("Download was interrupted — please try again.");
        }

        // Whole file is on the device → now (and only now) it counts.
        let newCount: number | null = null;
        if (downloadId) {
          const { data: count, error: completeError } = await supabase.rpc("complete_file_download", {
            p_download_id: downloadId,
            p_bytes: received,
          });
          if (completeError) console.warn("complete_file_download failed:", completeError);
          else newCount = typeof count === "number" ? count : null;
        }
        setProgress(100);

        const mimeType = headerValue(result.headers, "content-type")?.split(";")[0].trim();
        await Sharing.shareAsync(result.uri, {
          dialogTitle: fileName,
          ...(mimeType && mimeType !== "application/octet-stream" ? { mimeType } : {}),
        });
        return newCount;
      } catch (err) {
        // Nothing counted, nothing worth keeping: don't leave a partial file behind.
        if (dest) await LegacyFs.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
        // The native task may report a cancel as an ordinary failure; to the person it is still just a cancel.
        if (cancelledRef.current && !(err instanceof DownloadCancelledError)) throw new DownloadCancelledError();
        throw err;
      } finally {
        taskRef.current = null;
        setTimeout(() => setProgress(null), 800);
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

  /** Stops an in-flight download. Safe to call at any time; a cancelled download never counts. */
  const cancel = () => {
    cancelledRef.current = true;
    void taskRef.current?.cancelAsync().catch(() => undefined);
  };

  return Object.assign(mutation, { progress, cancel });
}
