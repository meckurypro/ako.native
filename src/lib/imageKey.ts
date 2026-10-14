// src/lib/imageKey.ts
// Pure helpers (no native imports, so they are unit-testable in node: scripts/test-image-cache.mjs).
//
// WHY: image caches (expo-image's disk cache, our own store) are keyed by URL. Signed URLs for private storage change
// their `?token=` every hour, so the SAME picture looked like a brand-new one after a refresh/restart and the offline
// cache missed. A stable key = the URL minus volatile auth/cache-busting params.

const REMOTE = /^https?:\/\//i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|svg)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)$/i;

/** Query params that never change which picture a URL points at. */
const VOLATILE_PARAMS = new Set(["token", "t", "ts", "download", "expires", "exp", "signature", "sig", "x-amz-signature", "x-amz-date", "x-amz-expires", "x-amz-credential", "x-amz-security-token", "x-amz-algorithm", "x-amz-signedheaders"]);

export function isRemoteUrl(uri: unknown): uri is string {
  return typeof uri === "string" && REMOTE.test(uri);
}

export function isVideoUrl(uri: string): boolean {
  return VIDEO_EXT.test(uri.split("?")[0].split("#")[0]);
}

/** The URL with volatile params and the fragment removed, remaining params sorted. */
export function stableImageKey(uri: string): string {
  const noHash = uri.split("#")[0];
  const q = noHash.indexOf("?");
  if (q === -1) return noHash;
  const base = noHash.slice(0, q);
  const kept = noHash
    .slice(q + 1)
    .split("&")
    .filter((pair) => pair && !VOLATILE_PARAMS.has(pair.split("=")[0].toLowerCase()))
    .sort();
  return kept.length ? `${base}?${kept.join("&")}` : base;
}

/** Deterministic 64-bit-ish hex digest (two FNV-1a passes). Not cryptographic — only used to name cache files. */
export function hashKey(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** "jpg" / "png" / … from the URL path, or "img" when it has no recognisable extension. */
export function imageExtension(uri: string): string {
  const path = uri.split("?")[0].split("#")[0];
  const m = IMAGE_EXT.exec(path);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "img";
}

/** File name the durable store uses for a URL: `<hash>.<ext>`. */
export function storeFileName(uri: string): string {
  return `${hashKey(stableImageKey(uri))}.${imageExtension(uri)}`;
}

const IMAGE_FIELD = /(^|_)(avatar|thumbnail|cover|image|icon|photo|picture|banner|poster)(_url|_urls)?$|^media_urls$/i;

/**
 * Walks query data (already-JSON) and collects image URLs from the fields that hold pictures, so a freshly fetched
 * list can have its pictures stored for offline BEFORE the user scrolls to them. Videos are skipped.
 */
export function collectImageUrls(data: unknown, limit = 60): string[] {
  const out = new Set<string>();
  const seen = new Set<object>();

  const take = (v: unknown) => {
    if (out.size >= limit) return;
    if (isRemoteUrl(v) && !isVideoUrl(v)) out.add(v);
  };

  const walk = (node: unknown, field: string | null, depth: number) => {
    if (out.size >= limit || depth > 7 || node == null) return;
    if (typeof node === "string") {
      if (field && IMAGE_FIELD.test(field)) take(node);
      return;
    }
    if (typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, field, depth + 1);
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, k, depth + 1);
  };

  walk(data, null, 0);
  return [...out];
}
