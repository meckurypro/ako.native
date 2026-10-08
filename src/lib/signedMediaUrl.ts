// src/lib/signedMediaUrl.ts
// Photos and documents in chat live in the private "chat-media" bucket (see
// supabase/ako_chat_media_bucket.sql in the web repo), so — exactly like voice notes
// (signedAudioUrl.ts) — a persisted message stores a storage PATH and every render
// resolves a short-lived signed URL. Cached per path for most of the URL's lifetime so
// scrolling past a photo twice, or the list re-mounting a cell, never re-signs it.
import { CHAT_MEDIA_BUCKET } from "./chatMedia";
import { supabase } from "./supabase";

const TTL_SECONDS = 60 * 60;
const SAFETY_MARGIN_MS = 5 * 60 * 1000;

const cache = new Map<string, { url: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string | null>>();

/** Resolves a chat-media path to a signed URL, or null if signing fails (not a participant, object gone…). */
export function getSignedMediaUrl(path: string, options: { download?: string | boolean } = {}): Promise<string | null> {
  const key = options.download ? `${path}#dl` : path;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.url);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const { data, error } = await supabase.storage
        .from(CHAT_MEDIA_BUCKET)
        .createSignedUrl(path, TTL_SECONDS, options.download ? { download: options.download } : undefined);
      if (error || !data?.signedUrl) return null;
      cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 - SAFETY_MARGIN_MS });
      return data.signedUrl;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}
