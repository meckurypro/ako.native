// src/lib/storageUpload.ts
// Upload a LocalFile to a Supabase Storage bucket. React Native's fetch can
// read a file:// URI straight into an ArrayBuffer, which supabase-js accepts
// (the web `File`/`Blob` objects don't exist here).
//
// NOTE: this buffers the whole file in memory — fine for images, voice notes
// and documents, but for the 500MB private-content bucket (course videos,
// books) swap in a resumable TUS upload in step 9.
import { supabase } from "./supabase";
import type { LocalFile } from "./localFile";

export async function uploadLocalFile(
  bucket: string,
  path: string,
  file: LocalFile,
  options: { upsert?: boolean } = {}
): Promise<void> {
  const response = await fetch(file.uri);
  const body = await response.arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: file.type,
    upsert: options.upsert,
  });
  if (error) throw error;
}
