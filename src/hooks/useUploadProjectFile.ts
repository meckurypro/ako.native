import * as LegacyFs from "expo-file-system/legacy";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { fileExtension, type LocalFile } from "../lib/localFile";
import { supabase } from "../lib/supabase";
import { uploadLocalFile } from "../lib/storageUpload";
import { useAuth } from "./useAuth";

const DEFAULT_MAX_FILE_SIZE = 500 * 1024 * 1024;
// storageUpload.uploadLocalFile reads the whole file into memory — fine for small files, not for hundreds of MB.
// Anything above this streams from disk instead, with progress.
const STREAM_THRESHOLD = 8 * 1024 * 1024;

interface Options {
  /** Largest file accepted, in bytes. File projects pass 1GB (the private-content bucket's limit). */
  maxBytes?: number;
}

function formatLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${Math.round(mb / 1024)}GB` : `${Math.round(mb)}MB`;
}

async function streamUpload(path: string, file: LocalFile, onProgress: (pct: number) => void): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const base = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;
  const url = `${base}/storage/v1/object/private-content/${path.split("/").map(encodeURIComponent).join("/")}`;

  const task = LegacyFs.createUploadTask(
    url,
    file.uri,
    {
      httpMethod: "POST",
      uploadType: LegacyFs.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
        "cache-control": "max-age=3600",
      },
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      if (totalBytesExpectedToSend > 0) onProgress(Math.min(99, Math.floor((totalBytesSent / totalBytesExpectedToSend) * 100)));
    },
  );
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    let message = "File upload failed.";
    try {
      const parsed = JSON.parse(result?.body ?? "{}");
      if (parsed?.message) message = String(parsed.message);
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
}

/**
 * Uploads a digital product file to the private-content bucket.
 * Unlike avatars/post-media, this bucket has NO public read policy —
 * the returned path is stored on the project row, and actual access
 * only ever happens through get-project-file, which mints a signed
 * URL after verifying purchase/ownership.
 *
 * Large files stream from disk and report `progress` (0–100).
 */
export function useUploadProjectFile(options: Options = {}) {
  const { user } = useAuth();
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_FILE_SIZE;
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: async (file: LocalFile): Promise<string> => {
      if (!user) throw new Error("Not signed in");

      if (file.size > maxBytes) {
        throw new Error(`File must be under ${formatLimit(maxBytes)}.`);
      }

      const ext = fileExtension(file);
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      setProgress(0);
      if (file.size > STREAM_THRESHOLD) {
        await streamUpload(path, file, setProgress);
      } else {
        await uploadLocalFile("private-content", path, file);
      }
      setProgress(100);

      // Return the PATH, not a public URL — this bucket has no public
      // read policy, so there is no public URL. The path is what
      // get-project-file uses to mint a signed URL later.
      return path;
    },
  });

  return Object.assign(mutation, { progress });
}
