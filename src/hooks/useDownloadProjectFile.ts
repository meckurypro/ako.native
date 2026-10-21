// src/hooks/useDownloadProjectFile.ts
// Downloads a File project's hosted file onto the device and only counts it once the WHOLE file has arrived:
//   1. get-project-file checks access, opens a download attempt (download_id) and returns a signed URL.
//   2. The file streams to disk (never into memory) with progress; its size on disk must match Content-Length.
//   3. Only then is the attempt completed (complete_file_download): that bumps the project's download_count and
//      notifies the creator. A cancelled/interrupted download counts for nothing.
//   4. The system share/save sheet opens so the person can keep it in Files / open it with another app.
import * as LegacyFs from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "../lib/supabase";

interface DownloadArgs {
  projectId: string;
  /** Used to name the saved file (title + the stored file's extension). */
  title: string;
  filePath: string | null;
}

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

export function useDownloadProjectFile() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ projectId, title, filePath }: DownloadArgs): Promise<number | null> => {
      setProgress(0);
      try {
        const { data, error } = await supabase.functions.invoke("get-project-file", {
          body: { project_id: projectId, kind: "file", action: "download" },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const url: string = data.url;
        const downloadId: string | null = data.download_id ?? null;

        const dest = `${LegacyFs.cacheDirectory}${Date.now()}-${suggestedFileName(title, filePath)}`;
        const task = LegacyFs.createDownloadResumable(url, dest, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            setProgress(Math.min(99, Math.floor((totalBytesWritten / totalBytesExpectedToWrite) * 100)));
          }
        });
        const result = await task.downloadAsync();
        if (!result || result.status !== 200) throw new Error("Download failed — please try again.");

        // Whole-file check: bytes on disk must equal what the server said it was sending.
        const expected = Number(headerValue(result.headers, "content-length")) || 0;
        const info = await LegacyFs.getInfoAsync(result.uri);
        const received = info.exists && "size" in info ? info.size : 0;
        if (!info.exists || received === 0 || (expected && received !== expected)) {
          await LegacyFs.deleteAsync(result.uri, { idempotent: true });
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

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.uri, { dialogTitle: suggestedFileName(title, filePath) });
        }
        return newCount;
      } finally {
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

  return Object.assign(mutation, { progress });
}
