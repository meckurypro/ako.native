# Download to library (offline copies of projects)

A signed-in person can save a **book, course, file or hosted media** project inside the app so it opens with **no mobile
network or Wi-Fi**. Nothing goes to the phone's Downloads folder: the copy lives in the app's own storage and is listed
in the **Library**. This is separate from the existing **Download** menu item on uploaded books, which hands a PDF to the
browser.

Native app only. The web app has no service worker/manifest, so it can't open at all without a network; a web "download"
would store data it couldn't then use. See "Not done" below.

## What the person sees

- **Where:** the project page's `···` options menu (next to Save / Share), never beside the main button (Read / Start
  course / …). Shown only to someone who can already open the project (paid, or free) and isn't its owner.
- **States in the menu:** `Download to library` → `Downloading… 42%` (tap to reopen progress) → `Remove download` (with
  the size).
- **Progress sheet:** real byte progress, Cancel, plain-language errors, Try again where retrying can help. Closing the
  sheet hides it; the download keeps going. Cancel is the only thing that stops it.
- **Mobile data:** if you're not on Wi-Fi and it's over 25 MB, it asks first.
- **On success:** haptic + toast, then straight to **Library** on the right tab with the new item scrolled into view and
  briefly highlighted (`/library?tab=<tab>&highlight=<projectId>`). Only if they're still on that page; if they've
  navigated away they get the toast and aren't pulled back.
- **Library:** saved items show `Saved offline · size` and a ✓ with a `···` menu (**Update download** when newer content
  exists, **Remove download**). Offline, the list narrows to exactly what's saved (everything else would be a dead end) and
  a banner says so. A footer shows total space used.

## What can be saved

| Type | What is stored | Opens in |
|---|---|---|
| Book written in Akọ | chapters (text) | the normal reader, `/books/:id` |
| Uploaded PDF book, host allows **reading in the app** and chapters exist | the extracted chapters | the reflow reader via `/projects/:id/read` |
| Uploaded PDF book, nothing to reflow (scan) or reading in-app off, host allows **download** | the PDF | system "Open with…" via `/projects/:id/offline` |
| Course | modules + lesson text | the normal course screen |
| File | the file | system "Open with…" |
| Hosted media (audio / video / image) | the hosted file(s) | in-app player via `/projects/:id/offline` |
| Link books, link-only media, links, events, meetings, rooms, talents, pitches | not offered | – |

Uploaded books follow the two host switches the same way the server already does: `allow_read_in_app` governs the
extracted chapters, `allow_download` governs the PDF. A book with both switches off can't be saved. A scanned PDF that
only reads through the online page-image reader can't be saved unless the host allows downloading it, until the owner
runs **Convert to text** (OCR): that writes chapters into the same `book_chapters` table behind the same gate, after
which it saves like any other reflowable book (people who had saved the PDF then see *Update available*).

Course lessons that embed YouTube/Vimeo, and media that links to another site, stay online-only (they aren't ours to
store); the rest of the course works offline.

## How it works

```
ProjectCard menu ─► startOfflineDownload (lib/offlineStore.ts)
   1 NetInfo + sign-in check
   2 rpc get_project_offline_bundle ── the server gate: access, host switches, what to save, sizes, version
   3 free-space check (keeps 50 MB headroom) + mobile-data confirm
   4 per hosted file: edge function get-project-file (signed URL, same gate as the Download button)
        └► File.downloadFileAsync → <documents>/offline/<user>/.tmp-*/<name>.part → moved when complete
   5 staged files → <documents>/offline/<user>/<project>/ ; THEN the index row is written (the commit marker)
   6 best-effort: warm the cover image, record on the server, seed the query cache, free-access event
```

- **Index + text** are in the encrypted SQLite DB (`lib/secureDb.ts`, SQLCipher), table `offline_projects`, keyed by
  `(user_id, project_id)`. It's a **separate table from `kv_cache`** on purpose: `wipeSecureCache()` empties `kv_cache` on
  sign-out, and a download is something the person chose to keep. If SQLCipher isn't available in a build, downloads are
  refused (`storage_unavailable`) rather than writing paid content in the clear.
- **Large files** are in the app sandbox, per user. They are not encrypted (too heavy to), but are only reachable through
  the app.
- **Atomic:** nothing is visible until every byte is on disk. A cancelled or failed download leaves nothing behind.
  `sweepOfflineOrphans` removes folders with no index row (killed mid-way) when the Library opens.
- **Reading offline without touching the readers:** `seedOfflineQueries` puts the saved data into React Query under the
  *same keys the online screens read* (`project`, `book-chapters`, `course-modules`, `project-book-details` /
  `project-media-details`, plus `has-purchased` / `is-project-member` so the access gates pass). It only fills **empty**
  entries, so live data always wins; online, the screens refetch and replace the seed.
- **Updates:** the server computes a content hash (`version`). The Library batches one `get_project_offline_versions` call
  and shows *Update available* when it differs. "Can't tell" (offline, or no longer accessible) is never shown as stale.
- **Sign-out:** downloads are kept (per user, never visible to another account on the same phone). Revisit if you'd
  rather wipe on sign-out, as Kindle/Netflix do; the cost is re-downloading over data.

## Backend (`ako/supabase/ako_offline_downloads.sql`)

- `can_access_project_content(project_id)`: one definition of "may this person get this content?", mirroring
  `get-project-file` (owner / purchased / free) plus the privacy rule the UI applies (private needs membership). Takes **no
  user argument**, so it can't be used to ask whether *someone else* bought something.
- `get_project_offline_bundle(project_id, include_content)`: the gate. `SECURITY DEFINER`, `authenticated` only. "Not
  found" and "not yours" answer identically. Errors are stable codes the app maps to messages: `sign_in_required`,
  `access_denied`, `download_not_allowed`, `not_downloadable`, `nothing_to_download`.
- `get_project_offline_versions(ids[])`: batch freshness check (max 100); only returns what the caller can access.
- `project_offline_version(id)`: internal (no client grant).
- `project_downloads(user_id, project_id, device_id, content_version, bytes, …)`: which device holds what. RLS: own rows
  only; insert/update also require content access. Best-effort from the app and reconciled when online
  (`reconcileOfflineRecords`): upserts what's missing, deletes records for copies removed while offline.

Rows in the bundle are `to_jsonb(row)`, i.e. exactly what `select *` returns, so they drop into the same cache entries.

## Also changed (separate commit): starting the app offline

`useAuth` now keeps the session stored on the device when `getSession()` comes back empty **because the server couldn't be
reached** (`lib/authOffline.ts`). Without it, supabase-js returns `null` once the ~1h access token has expired and can't
refresh, so a signed-in person opening the app offline was bounced to a login screen that can't work offline, and no
download was reachable. A genuinely invalid or revoked session is not a network error and still signs out.

## Verified / not verified

Verified (Ako Temp + CI-style checks): migration applied and exercised with impersonated users inside rolled-back
transactions (owner, other user, anon; paid/unpurchased, private non-member, every uploaded-book switch combination,
link books, empty courses, external-only media, hosted audio/video/image, version stability, RLS on
`project_downloads`); `tsc --noEmit` clean; `node scripts/test-offline-projects.mjs`, `test-auth-offline.mjs` and the
existing suites pass; an Android Metro bundle builds.

**Not verified: any on-device run.** Needs a real device (dev build, SQLCipher):
1. Download an authored book on Wi-Fi → lands in Library highlighted → airplane mode → force-quit → reopen → Library
   shows it → it reads. Repeat with a course and with a hosted audio/video/PDF.
2. Cold start offline **after the access token expired** (leave the app closed > 1h, then airplane mode): the app should
   open signed-in, not at login. Then reconnect: it should refresh quietly.
3. Cancel mid-download; kill the app mid-download; fill the disk: nothing partial should remain / listed.
4. A paid project, a private project, an uploaded PDF with each host switch combination.
5. Remove a download offline, reconnect: the server record should disappear.

## Known limits / decisions for you

- **Authored books and courses have no creator opt-out.** `allow_download` only exists for uploaded books (the UI never
  sets it for authored ones). Offline copies of authored books/courses are therefore always allowed. If creators should
  be able to forbid it, that needs a switch and a check in `get_project_offline_bundle`.
- **Completing lessons offline** waits for a connection (course progress writes are online-only mutations, per
  `OFFLINE_FIRST.md`). Reading works.
- **Reviews, reading position and other writes** made offline are not queued by this feature.
- **A free course may not read online for non-owners:** `course_modules`/`course_lessons` RLS only allows owner or
  purchaser. The offline copy comes from the server-side bundle (which does allow free), so it can read where the online
  screen can't. Worth checking separately.
- Owners don't get the option (their menu is the management menu).
- Not built: web version (needs a PWA shell first), downloading YouTube/Vimeo lesson media, a global "downloading…"
  indicator outside the project page and Library, a "free up space" screen (`removeAllOfflineProjects` exists), wipe on
  sign-out.
