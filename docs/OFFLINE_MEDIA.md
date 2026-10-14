# Offline media — how pictures, icons and sounds work with no network

## Bundled (always work, no network involved)
Everything loaded with `require()` ships inside the app binary: UI sounds (`assets/sounds`, `lib/sounds.ts`), the 41 gift icons
(`lib/giftAssets.ts`), wordmark/app icons/patterns (`assets/images`, `assets/patterns`), notification sounds/icon (native, via the
`expo-notifications` plugin), fonts (`@expo-google-fonts/*` packages) and all UI icons (lucide = SVG components).
Remote fallback exists only for a gift whose icon isn't bundled; it goes through the durable image path below.

## Remote pictures (avatars, post media, thumbnails…) — `components/ui/styled.tsx` `Image`
1. **Stable cache key** (`lib/imageKey.ts`): volatile params (`token`, `download`, …) are stripped, so a re-signed URL is the
   same picture to the cache. (Before: key = full URL, so signed URLs missed the cache after every hourly re-sign.)
2. **Durable store** (`lib/imageStore.ts`): a copy lives in `<cache>/image-store/<hash>.<ext>`. Rendered from there once
   present; while it downloads we render nothing (no double download); offline/failed → falls back to the remote URL, which
   expo-image's own disk cache may still hold. Caps: 8 MB/file, 250 MB total (oldest evicted), 4 parallel, 12 s timeout,
   60 s back-off after a failure. Why not expo-image alone: SDWebImage (iOS) expires disk entries after ~7 days.
3. **Warm-up**: when a persisted query (feed page 1, conversations, notifications, profiles…) succeeds, its avatar/thumbnail/
   post-image URLs are stored immediately (`queryClient.ts` → `prefetchImagesFromData`), not only when scrolled into view.
4. **Data survives too** (`lib/queryPersister.ts`): a picture is useless if the list that names it is gone on a cold offline
   start. Added roots: `feed-posts` (page 0 only), `my-profile`, `own-profile`, `profile`. Persisted roots now get
   `gcTime = 7 days` (default 5 min evicted them from memory, hence from the next snapshot). A snapshot over budget sheds the
   bulky lists instead of skipping the whole write, and never drops queued offline mutations.

Opt out with `<Image durable={false} />` for media that must not be auto-stored.

## Chat media (deliberately separate)
Private bucket, WhatsApp-style tap-to-download (`lib/chatMediaStore.ts`, files in `<documents>/chat-media`). Not auto-stored.
Previews that were streamed use `cacheKey = chat-media/<storage path>` so they stay cached across re-signing.

## Known limits
Voice notes (private `audio` bucket) still stream from a signed URL and need network unless the note was recorded on this
device. Music-catalogue clips, YouTube/Vimeo lesson embeds and videos need network. The store lives in the OS cache dir
(not backed up to iCloud); the OS may purge it under storage pressure — it simply refills when online.

Test: `node scripts/test-image-cache.mjs`.
