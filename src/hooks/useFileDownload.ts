// src/hooks/useFileDownload.ts
// A Custom Page's download buttons, done in-app (the way WhatsApp opens a document):
//   1. "Preparing…"  — confirm the file is still there and the phone can hand it on.
//   2. toast "Download started"; the file streams to disk (never into memory), the button shows its progress.
//   3. The system share/save sheet opens, which covers "Save to Files / Drive", "Open with…" and sending it on.
// A file that arrives incomplete is thrown away, never shared.
import * as LegacyFs from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { safeStorageName } from "@/lib/chatMedia";
import { prepareDownload } from "@/lib/downloadFile";

export type DownloadPhase = "idle" | "preparing" | "downloading";

const DOWNLOAD_DIR = "custom-page-downloads/";
const STALE_AFTER_MS = 15 * 60 * 1000;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

const MESSAGES = {
  missing: "That file isn't available any more.",
  slow: "That took too long. Please try again.",
  noShare: "This device can't save files from Akọ.",
  failed: "The download didn't finish. Please try again.",
} as const;

function headerValue(headers: Record<string, string> | undefined, name: string): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : null;
}

// Android's share sheet reads the file after shareAsync resolves, so a finished download can't be deleted right
// away — old ones are swept the next time a download starts (and the OS reclaims the cache on its own too).
async function prepareDir(): Promise<string> {
  const dir = `${LegacyFs.cacheDirectory}${DOWNLOAD_DIR}`;
  await LegacyFs.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  try {
    const now = Date.now();
    for (const name of await LegacyFs.readDirectoryAsync(dir)) {
      const stamp = Number(name.split("-")[0]);
      if (!Number.isFinite(stamp) || now - stamp > STALE_AFTER_MS) await LegacyFs.deleteAsync(`${dir}${name}`, { idempotent: true });
    }
  } catch {
    /* sweeping is best-effort */
  }
  return dir;
}

export function useFileDownload() {
  const toast = useToast();
  const [phase, setPhase] = useState<DownloadPhase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const running = useRef(false);

  const start = useCallback(
    async (url: string | null, fileName: string) => {
      if (!url || running.current) return;
      running.current = true;
      setPhase("preparing");
      setProgress(null);
      let dest: string | null = null;
      try {
        const check = await prepareDownload(url);
        if (!check.ok) {
          toast(MESSAGES[check.reason], { variant: "error" });
          return;
        }
        if (!(await Sharing.isAvailableAsync())) {
          toast(MESSAGES.noShare, { variant: "error" });
          return;
        }

        const name = safeStorageName(fileName);
        const dir = await prepareDir();
        dest = `${dir}${Date.now()}-${name}`;
        setPhase("downloading");
        toast("Download started", { variant: "success" });

        const task = LegacyFs.createDownloadResumable(url, dest, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) setProgress(Math.min(99, Math.floor((totalBytesWritten / totalBytesExpectedToWrite) * 100)));
        });
        const result = await task.downloadAsync();
        if (!result || result.status !== 200) throw new Error("bad_status");

        // Whole-file check: bytes on disk must equal what the server said it sent (a compressed response is stored
        // decoded, so there the only thing to check is that something arrived).
        const compressed = !!headerValue(result.headers, "content-encoding");
        const expected = compressed ? 0 : Number(headerValue(result.headers, "content-length")) || 0;
        const info = await LegacyFs.getInfoAsync(result.uri);
        const received = info.exists && "size" in info ? info.size : 0;
        if (!info.exists || received === 0 || (expected && received !== expected)) throw new Error("incomplete");
        setProgress(100);

        const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
        const headerType = headerValue(result.headers, "content-type")?.split(";")[0].trim();
        const mimeType = MIME[ext] ?? (headerType && headerType !== "application/octet-stream" ? headerType : undefined);
        await Sharing.shareAsync(result.uri, { dialogTitle: fileName, ...(mimeType ? { mimeType } : {}) });
      } catch {
        if (dest) await LegacyFs.deleteAsync(dest, { idempotent: true }).catch(() => undefined);
        toast(MESSAGES.failed, { variant: "error" });
      } finally {
        running.current = false;
        setPhase("idle");
        setProgress(null);
      }
    },
    [toast],
  );

  /** What the button should say while this is running. */
  const label = (idle: string) =>
    phase === "preparing" ? "Preparing…" : phase === "downloading" ? (progress !== null ? `Downloading ${progress}%` : "Downloading…") : idle;

  return { busy: phase !== "idle", phase, progress, label, start };
}
