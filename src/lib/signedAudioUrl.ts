// src/lib/signedAudioUrl.ts
import { supabase } from "./supabase";

// The "audio" bucket is private (see the
// private_audio_bucket_with_participant_read_rls migration) — every
// persisted voice note is read through a short-lived signed URL rather
// than a permanent public one, so a leaked link can't be replayed
// forever and access always re-checks conversation/room membership.
// Signing is a real network round trip, so this caches the result per
// storage path for most of the URL's own lifetime: a bubble
// re-rendering (scrolling past it twice, a parent re-render, the
// virtualized list re-mounting it) shouldn't re-request a signature it
// already holds.
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
// Stop trusting a cached URL a little before it actually expires, so a
// request that started near the boundary can't land after the bucket
// has already rejected the signature.
const SAFETY_MARGIN_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, { url: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Resolves a storage path in the "audio" bucket to a playable signed
 * URL, reusing a cached one until it's close to expiring. Returns null
 * if signing fails — most commonly because the requesting user isn't
 * actually a participant in the conversation/room the note belongs to
 * (the storage.objects SELECT policy enforces that; this function
 * doesn't duplicate the check, it just surfaces the failure) — or
 * because the object itself no longer exists.
 */
export function getSignedAudioUrl(path: string): Promise<string | null> {
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.url);

  const pending = inFlight.get(path);
  if (pending) return pending;

  const request = (async () => {
    try {
      const { data, error } = await supabase.storage.from("audio").createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) return null;
      cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - SAFETY_MARGIN_MS });
      return data.signedUrl;
    } finally {
      inFlight.delete(path);
    }
  })();

  inFlight.set(path, request);
  return request;
}
