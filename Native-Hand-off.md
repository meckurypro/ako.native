# Akọ React Native port — Session Handoff

> **Audience:** a fresh Claude session continuing this build. Read this whole file before touching code.
> **Written:** end of the session that took native `main` from `1301ff0` → `fdf1a02`.
> **Owner:** Meckury (Emeka Kingsley Madu), Nigeria. Solo developer, IQ Universe founder. Wants honest status, not optimism.

---

## 0. TL;DR

- The native app (`github.com/meckurypro/ako.native`, branch `main`, head **`fdf1a02`**) now has **~61 of 67 routes as real screens**. Only **6 routes are still placeholders**.
- **Nothing has ever run on a device or emulator.** Every gesture, keyboard, animation, theming, push, camera, SQLCipher and live-backend behaviour is **unverified**. Treat each status report as incomplete until it lists the unverified items.
- This session shipped: Course, Book (authored), Ticket, Event check-in, Room, Activity hub (+7 sub-pages), Library, Gigs, Affiliate links, Settings, Notifications, **push notifications**, **encrypted storage (AES session + SQLCipher cache)**, and permissionless add-to-calendar.
- **The most valuable next work is blocked on the owner** (payment-model decision, EAS setup, anon key). Section 6 lists exactly what to ask, in order.

---

## 1. Project context (carry-over from the original brief)

**Goal:** a faithful native replica of the Akọ web app, built with standard React Native best practices. Admin pages (26) are **out of scope** — the owner keeps using the web for admin.

| | |
|---|---|
| Web (source of truth) | `https://github.com/meckurypro/ako` — Vite + React 19 + TS + Tailwind v4 + react-router + Supabase. ~350 files / 63k lines |
| Native | `https://github.com/meckurypro/ako.native`, branch `main` |
| Web prod URL | `https://ako-lime.vercel.app` (= `EXPO_PUBLIC_APP_URL`, used for share links) |
| Supabase project | `https://nokuwkxosyegaexlzdsl.supabase.co` (project id `nokuwkxosyegaexlzdsl`) |

**Stack (native):** Expo SDK 57 (57.0.26), RN 0.86, React 19.2, Expo Router (`src/app`, groups `(auth)` `(onboarding)` `(app)`), TypeScript strict, `@/` → `src/`. NativeWind 5.0.0-rc.0 + react-native-css 3.1.0-rc.0 + Tailwind v4. FlashList v2, Reanimated, expo-video/expo-audio.

### Hard rules (violating these breaks the build or the owner's trust)

1. **Never upgrade `lightningcss`.** Pinned to `1.30.1` via `overrides` *and* a direct dependency. 1.30.2+ breaks react-native-css's compiler.
2. **Never import `Text` from `react-native`.** Use `components/ui/Text` (maps `font-display`/`font-bold`/`italic` to registered per-weight fonts).
3. **`className` does not reach third-party components.** Use wrappers in `components/ui/styled.tsx` (`Image` = expo-image, `Icon` = lucide with `text-*` colour mapping).
4. **tsconfig has `lib: ES2022` only (no DOM)** — leftover web APIs fail typecheck. RN declares global `File`/`Blob`/`FormData`, so grep for those yourself.
5. **Every file starts with a one-line path comment** (`// src/...`).
6. **Hooks/lib are copied from web with minimal edits and relative imports; screens live in `src/screens` and are re-exported by thin route files.**
7. **Install deps with `npm install --legacy-peer-deps`**, using versions from `node_modules/expo/bundledNativeModules.json` (the Expo version API is unreachable from the sandbox). Strip the `^` npm adds for Expo-managed packages.
8. **Never store a GitHub token** in git config, files, or notes. Never push without the owner providing one. **Never force-push.**
9. Don't invent RPC names, columns or edge-function behaviour. If backend behaviour can't be confirmed, **read it** (see §4) or ask.

### Conventions worth knowing

- Overlay layer: `Portal/PortalHost` (zIndex tiers: dropdown/sheet 50, modal 60, toast 70, viewer 80). Modals/dialogs use `overlay-*` colour tokens (`text-overlay-ink`, `bg-overlay-accent`, …), not the page tokens.
- `ChromeProvider` owns the auto-hiding top bar + persistent `BottomNav`; per-route visibility is in `components/nav/routes.ts`. Screens with nav use `useBottomNavInset()` + `useChromeScroll()`; screens without use `useSafeAreaInsets().bottom`.
- Composers use `useAnimatedKeyboard` (not `KeyboardAvoidingView`) — see `MessageThread`, `RoomChat`.
- Tabs: `SwipeableTabs` + `useTabState` (see `components/activity/PostsProjectsHub.tsx`).
- Auth guard is `AuthGate`; it redirects on sign-out, so **never navigate manually after `signOut`**.
- Local KV: `localStorage` is a **synchronous sqlite-backed polyfill** (`lib/polyfills.ts`, imported first in `_layout`). It is **plaintext** — only non-sensitive UI prefs belong there.

---

## 2. How to work (what has worked)

1. Read the web source for a page (strip comments: `grep -v "^\s*//\|^\s*\*\|^\s*/\*"`), port it preserving behaviour and copy.
2. `npx tsc --noEmit` must be clean.
3. Bundle: `EXPO_PUBLIC_SUPABASE_URL=https://nokuwkxosyegaexlzdsl.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=placeholder EXPO_PUBLIC_APP_URL=https://ako-lime.vercel.app npx expo export --platform android --output-dir /tmp/x` (~40–60 s). Catches Metro/NativeWind errors. **A placeholder key is fine for bundling; no `.env` exists yet.**
4. **Unit-test pure logic in node** by transpiling TS: `ts.transpileModule(src, {compilerOptions:{module:"commonjs"}})` + `new Function("module","exports","require",js)` with a mock `require`. This session did it for `lib/notificationRoute.ts`, `lib/secureStorage.ts`, `lib/queryPersister.ts`. **Those test scripts lived in `/tmp` and are gone** — re-create them (ideally commit them under `scripts/`).
5. **Verify native config by running prebuild in a throwaway copy** (this caught three real bugs — see §9):
   ```sh
   mkdir /tmp/pb && tar --exclude=node_modules --exclude=.git --exclude=android --exclude=ios -cf - . | tar -xf - -C /tmp/pb
   ln -s $PWD/node_modules /tmp/pb/node_modules
   cd /tmp/pb && EXPO_PUBLIC_SUPABASE_URL=x EXPO_PUBLIC_SUPABASE_ANON_KEY=x CI=1 npx expo prebuild --no-install
   # inspect android/app/src/main/AndroidManifest.xml and ios/Ak/Info.plist + Ak.entitlements
   ```
   Note the iOS target is named **`Ak`** because the app name is `Akọ` (non-ASCII stripped) — cosmetic, but decide before store builds.
6. Commit per logical chunk; report with line/screen counts; **surface the "unverified on device" list in every status update**.

### Sandbox gotchas

- `/bin/sh` is **dash**: no bash here-strings, no brace expansion, no `time`. Use python3 or heredocs for multi-line edits (python3 + PIL are available).
- `web_search`/`git` work only for allowlisted hosts (github.com, npm registries). **`supabase.co` is not reachable from the sandbox**, so the app can't be tested against the live backend — but a **Supabase MCP connector** may be available in the session (read-only use so far; see §4).
- A fresh clone has **no git identity**: `git config user.name Claude && git config user.email noreply@anthropic.com` (repo-local). Prior commits use `Claude <noreply@anthropic.com>`.
- **Before pushing, `git fetch` and check for divergence.** The owner (or another session) pushed once mid-session (`ea34f74` "Chat: WhatsApp-style media, voice recording and composer"). Rebase onto it, re-run `tsc` + bundle, then push. A rejected push is not an error to force through.
- Push form (token supplied by owner each time, masked in output):
  `git push "https://x-access-token:TOKEN@github.com/meckurypro/ako.native.git" HEAD:main 2>&1 | sed 's/github_pat_[A-Za-z0-9_]*/***/g'`
  The owner has said they'll rotate the token used this session. **Ask for a fresh one.**

---

## 3. What was achieved

### 3.1 Commit log this session (`1301ff0` → `fdf1a02`)

| Commit | What |
|---|---|
| `a29fad5` | Course viewer + builder, `LessonMedia` (WebView / expo-video), `FeedDoorway`; add `react-native-webview`, `expo-camera` |
| `88e8ead` | Book (authored): reflow reader (themes, size slider, resume), builder (cover persists), locked view |
| `1fcf338` | `TicketView` + `EventCheckIn` (expo-camera QR), mono font helper, camera plugin |
| `70ff0ce` | Room part 1: `RoomChat`, `ClassroomTab`, `MeetingsTab`, `AssignmentsTab`, `HostSettingsPanel`, call placeholder, `useMicGesture` |
| `ea34f74` | *(owner's commit)* Chat: WhatsApp-style media, voice recording, composer |
| `7797682` | Room part 2: screen shell, gates, tabs, route |
| `1babe18` | **Step 12**: Activity hub + Saved/Liked/Drafts/Scheduled/History/Events, Library, Gigs, MyAffiliateLinks, Settings, redirects |
| `8ec0bea` | `RoomChat` passes `localUrl` → instant optimistic voice bubble |
| `fdf1a02` | **Step 11**: notifications + push, encrypted storage, offline cache, calendar, iOS mic fix |

### 3.2 Step 9 (Projects) — done this session

| Screen | Files | Notes |
|---|---|---|
| **Course** | `screens/Course.tsx`, `components/project/LessonMedia.tsx` | Modules/lessons CRUD (inline), reorder, free-preview, progress, auto-complete (text lessons after 4 s; media lessons on end), publish. YouTube/Vimeo in a WebView (sends `Referer` = app URL to avoid YouTube error 153); direct video in expo-video |
| **Book (authored)** | `screens/Book.tsx`, `components/project/book/{BookBuilder,BookLockedView,BookReflowReader}.tsx` | Builder with chapters + optional sections + cover. Reader: light/sepia/dark, text-size slider, resumes chapter **and scroll fraction**, Android back → contents list |
| **TicketView** | `screens/TicketView.tsx` | Issued image or QR + code card; save/share via `expo-file-system` + `expo-sharing` |
| **EventCheckIn** | `screens/EventCheckIn.tsx` | `expo-camera` `CameraView` QR scanning (replaces jsqr), manual code, permission states, host-only |
| **Room** | `screens/Room.tsx`, `components/room/*` | Gates (members-only / not-started countdown / ended-archive), 4 tabs (all panes stay mounted), host settings + co-hosts, polls, voice lectures, group chat with emoji + hold-to-record, assignments review |
| Shared | `FeedDoorway`, `ProjectList`, `RoomMedia`, `VoiceComposerOverlay`, `useMicGesture`, `theme/mono.ts` | |

### 3.3 Step 12 — done (all of it)

- **Activity hub** `screens/Activity.tsx` (+ draft/scheduled count badges) and sub-pages: **Saved** & **Liked** (shared `PostsProjectsHub`: swipeable Posts|Projects tabs with indicator), **Drafts**, **Scheduled** (Resume → Compose with `draftId`/`scheduledId`), **History**, **Events & meetings**.
- **Library** (`LibraryActivity`), **Gigs** (`MyGigs`), **Affiliate links** (`MyAffiliateLinks`, mounted at both `/activity/affiliates` and `/wallet/affiliate-links`).
- **Settings** (one hub, six→seven sections, one open at a time): Profile (photo, display name, live username availability, bio w/ mentions, website, job/hobby tags), Account & security (password), Privacy (private account, hide lists, blocked/muted), **Notifications**, Appearance, Sound, Advanced (deactivate). Supports `?section=`.
- **Redirects** (match web): `/bookmarks`→`/activity/saved`; `/saved-projects`→`/activity/saved?tab=projects`; `/activity/library`→`/library`; `/settings/advanced|appearance`→`/settings?section=…`. `/settings/profile` = Settings.

### 3.4 Step 11 — notifications & push (done in code, **unverified on device**)

**Backend contract (read from the live project, not guessed):**

- RPC **`register_push_token(p_token text, p_platform 'ios'|'android')`** — upserts on token, so a token moving to another signed-in user is re-assigned.
- RLS: users may **DELETE their own** `public.push_tokens` rows (used on sign-out).
- Delivery is via **Expo's push API** (`ExponentPushToken[...]`).
- **Activity pushes** are sent by a DB trigger → `send-activity-push`. Payload `data`: `{type:"activity", notificationType, notificationId, source:"user"|"page"}`. Channel **`activity`**, sound **`ako_activity.wav`**. No target ids in the payload (privacy) → a tap must look the row up.
- **Chat pushes are CLIENT-invoked:** after a message insert, the sender's app must call `send-message-push` with `{message_id}`. The function verifies the caller is the sender. Payload `data`: `{type:"message", conversationId}`. Channel **`messages`**, sound **`ako_message.wav`**. *The web never did this (web has no push), so it had to be added natively.*
- `check-push-receipts` + cron handle Expo receipts/`DeviceNotRegistered`.

**What was built:**

| Piece | File(s) |
|---|---|
| Android channels (`messages` HIGH, `activity` DEFAULT, `default`) | `lib/notificationChannels.ts` |
| Foreground handler (suppresses a push for the open conversation; badge computed, not incremented) + channel init at startup | `lib/notificationHandler.ts` (side-effect import in root `_layout`), `lib/pushState.ts`, `hooks/useActiveConversationPush.ts` |
| Permission store (shared, `useSyncExternalStore`) | `lib/pushPermissionStore.ts` |
| Token mint/register/**unregister**, tray dismissal | `lib/push.ts` |
| Lifecycle: registration (≤ once/6 h per user+token), **tap routing** (cold start via `useLastNotificationResponse`), foreground refresh, **badge sync** | `hooks/usePushLifecycle.ts` (mounted in `(app)/_layout`) |
| **Chat push trigger** — wired into `useSendMessage`, `useSendVoiceNote`, forward, `useSendMedia` | `lib/pushNotify.ts` |
| Sign-out: unregister token (3 s time-box) + wipe cache **before** `auth.signOut()` | `hooks/useAccountAccess.ts` (`useSignOut`) |
| One routing function shared by list rows and push taps (**unit-tested**) | `lib/notificationRoute.ts` |
| Notifications screen (list, pull-to-refresh, mark-all-read, page-mode, `?open=<id>` deep-open) | `screens/Notifications.tsx` |
| Page-invite / collaboration-invite / music-credit response dialogs | `components/notifications/ResponseModals.tsx` |
| Contextual permission ask card (never at launch; 14-day dismiss) | `components/notifications/PushPermissionCard.tsx` |
| Settings → Notifications section | `components/settings/NotificationsSection.tsx` |
| Assets | `assets/notifications/{ako_message.wav, ako_activity.wav, notification-icon.png}` (sounds copied from existing in-app sounds; icon cut from the wordmark's luminance — the alpha channel gives a solid square) |

Added copy for notification types the web leaves blank: `comment` ("commented on your post") exists in real data; `give_back_received` exists in server copy.

### 3.5 Security & offline storage (new this session)

**Finding fixed:** the Supabase **session (access + refresh token)** and the account switcher's **saved accounts' refresh tokens** were stored in **plaintext** (`AsyncStorage` / `localStorage`).

- `lib/secureStorage.ts` — 256-bit master key in Keychain/Keystore (`SecureStore`, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), loaded into memory by `initSecureStorage()`; **AES-256-CTR** (`aes-js 3.1.2`) with a fresh random 128-bit counter per write; values prefixed `enc:v1:`, plaintext carries an `AKO1` magic so a lost/changed key reads as `null` (user re-logs in) rather than garbage. **Legacy plaintext is migrated on first read — no forced sign-out.** Root `_layout` renders nothing until init resolves (splash still up).
- `lib/supabase.ts` uses `encryptedAuthStorage`; `lib/accountSessions.ts` encrypts saved sessions + the pending-add handoff.
- `lib/secureDb.ts` — **SQLCipher** DB `ako-secure.db` (`kv_cache(namespace,key,value,updated_at)`), raw key applied with `PRAGMA key = "x'<hex>'"`. **Fails closed in release**: if `PRAGMA cipher_version` returns nothing (no SQLCipher in the build) it refuses to open and callers skip caching. Wrong key/corruption → delete & recreate (cache is disposable). `wipeSecureCache()` **pauses writes** until the next sign-in so a queued write can't resurrect data.
- `lib/queryPersister.ts` + `hooks/usePersistedQueries.ts` — persists an **allow-list** of React Query roots (`notifications`, `page-notifications`, `conversations`, `archived-conversations`) with a 2 s trailing throttle, 2 MB cap, flush on background, `dispose()` (not flush) on sign-out/account switch, 7-day max age, buster = app version + `CACHE_VERSION`. `(app)/_layout` renders a blank view for ≤1.5 s while it restores.
- `lib/queryClient.ts` — **NetInfo → `onlineManager`**: offline queries pause and serve cache; on reconnect they refetch (this is the "sync with database").
- `app.json`: `expo-sqlite` plugin `useSQLCipher: true` (**requires a dev/EAS build; Expo Go cannot run this app**).

### 3.6 Calendar

`lib/calendar.ts` → `addToCalendar()` opens the **OS's own "new event" screen** (`createEventInCalendarAsync` from **`expo-calendar/legacy`** — the main-entry export *throws at runtime in SDK 57*). No calendar permission needed; Android `READ/WRITE_CALENDAR` are blocked via `android.blockedPermissions`. Falls back to the `.ics` share. Used by `ProjectDetail`.

### 3.7 `app.json` plugin set (verified by prebuild)

`expo-router`, `expo-secure-store`, `expo-font`, **`expo-camera`** (camera + mic strings, `recordAudioAndroid: true`), **`expo-notifications`** (icon, colour `#3D5A45`, `defaultChannel`, sounds), **`expo-sqlite`** (`useSQLCipher`), **`expo-calendar`** (`reminders: false`), **`expo-audio`** (mic string), **`expo-image-picker`** (photos/camera/mic strings). `android.blockedPermissions`: READ/WRITE_CALENDAR.

### 3.8 Dependencies added this session

`react-native-webview 13.16.1`, `expo-camera ~57.0.6`, `@react-native-community/slider 5.2.0`, `expo-notifications ~57.0.21`, `expo-device ~57.0.2`, `expo-calendar ~57.0.5`, `@react-native-community/netinfo 12.0.1`, `@tanstack/react-query-persist-client 5.104.0`, `aes-js 3.1.2` (+ `@types/aes-js 3.1.4` dev). `lightningcss` still `1.30.1`.

---

## 4. Backend knowledge (so you don't have to rediscover it)

**How it was read:** a **Supabase MCP connector** (project `nokuwkxosyegaexlzdsl`), **read-only** (`list_edge_functions`, `get_edge_function`, `list_migrations`, `list_tables`, `execute_sql` for `pg_get_functiondef`/`pg_policies`/`information_schema`). Nothing was modified. If the connector isn't present in your session, ask the owner to enable it; the sandbox cannot reach supabase.co directly.

- **~130 public tables, all RLS-on; ~185 migrations**, latest 2026-09-25 (schema is current). `feature_flags` has 25 rows.
- **44 edge functions, all active.** Known ones: money — `initiate-deposit`, `verify-deposit`, Paystack webhook handlers, `process-withdrawal`, `add-payout-account`, `list-banks`, `resolve-bank-account`; meetings — `mint-meeting-token`, `start-meeting-recording`, `stop-meeting-recording`, `get-meeting-recording`, `livekit-webhook`; content — `purchase-project`, `get-project-file`, `publish-music`, `unpublish-music`; push — `send-activity-push`, `send-message-push`, `check-push-receipts`; **`verify-iap-receipt`** (see §6, decision 1). *Re-list via the connector for the full 44.*
- **Test data is thin:** `course_*`, `book_*`, `room_*`, `event_tickets`, `meeting_recordings` have **0 rows**; `project_meeting_details` has 1. Real-device testing of step 9 will need seeded data.
- Notification types actually present in the DB include `comment` (which the web's type map lacks).
- The anon key has **not** been provided; no `.env` exists. The native `.env` (gitignored) needs `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_APP_URL` (see `.env.example`).
- Storage buckets seen in code: `avatars`, `post-media`, `private-content` (~500 MB limit), `audio`, `event-highlights`, `ad-media`, music catalogue, `room_recordings` (public).

---

## 5. What is left

### 5.1 Remaining placeholder routes (6)

| Route file (`src/app/(app)/…`) | Screen | Blocked by |
|---|---|---|
| `projects/[projectId]/read.tsx` | **BookReader** (uploaded PDF books) | **Decision** (PDF approach) |
| `meetings/[projectId].tsx` | **MeetingRoom** (LiveKit) | **Decision** + EAS dev build |
| `wallet/index.tsx` | **Wallet** | **Decision** (payments) |
| `wallet/fund.tsx` | **FundWallet** | **Decision** (payments) |
| `wallet/withdraw.tsx` | **Withdraw** | **Decision** (payments) |
| `wallet/deposit/callback.tsx` | **DepositCallback** (payment redirect via deep link) | **Decision** (payments) |

(`wallet/affiliate-links` is done.)

### 5.2 Step 9 leftovers (besides the two placeholders above)

- **Music:** `AddMusicSheet`, discovery sheet, `PublishMusicButton` (+ on `ProjectDetail`), clip selector. Compose currently only *shows* already-attached music. Parked code: `src/_pending/audioClip.ts` (clip trimming). Backend: `publish-music` / `unpublish-music`.
- **In-Room video call:** `components/room/RoomCallView.tsx` is a **placeholder** ("Video calls aren't available in the app yet…"). Its props are the contract; the real LiveKit component replaces it 1:1. Parked: `src/_pending/useLiveKitRoom.ts`.
- **Room assignments:** only **text** submissions. Audio/video/image submissions aren't wired on web either.

### 5.3 Step 14 (extras)

- **Offline writes** — nothing queues a message/post sent offline (React Query pauses mutations while offline but they're lost on app kill). Needs an outbox (persisted mutations + idempotency + optimistic-item handling).
- **Wider offline reads** — message threads and feed are *not* cached (threads hold optimistic temp items that must not be replayed). Extending `PERSISTED_QUERY_ROOTS` needs that handled first.
- **Biometrics** (`expo-local-authentication` is installed; the iOS Face ID string is the generic default — set a real one).
- **On-device AI** — plan in the web repo's `AKO_NATIVE_AI_IMPLEMENTATION.md` (only relevant here).

### 5.4 Step 15 (release)

QA/performance pass; EAS builds; app icon/splash check; store release; **universal links** (`associatedDomains`, Android intent filters, `assetlinks.json` — only once the custom domain exists); trim default Android permissions (`READ/WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW` come from Expo's template — left untouched because untestable here); privacy manifest / Play **Data safety** form (data collected includes push token, profile, user content).

---

## 6. Decisions & actions needed from the owner (ask in this order)

**Actions only the owner can do**

1. **Anon key** → to create `.env`. (Sandbox can't use it against supabase.co, but it completes local setup.)
2. **Confirm `ako://auth/callback`** is in Supabase → Auth → URL Configuration → Redirect URLs. *Asked twice; never answered.* Email links fail without it.
3. **`eas init`** → writes `extra.eas.projectId`. **Until it exists, push registration is silently disabled by design** (`lib/push.ts` warns in dev).
4. **Push credentials in EAS:** Android **FCM** (`google-services.json`) and an Apple **APNs key**.
5. **Build an EAS dev client and test on a physical phone.** Simulators can't receive push (`Device.isDevice` guard — Android emulators with Play Services are also skipped, a dev inconvenience). SQLCipher, LiveKit, webrtc and notification sounds all need a dev build. Expo Go is not enough.
6. **Rotate the GitHub token** used this session; provide a fresh short-lived fine-grained token per push.

**Decisions**

1. **Wallet funding: Paystack (as web) vs in-app purchase (`verify-iap-receipt` already exists on the backend).** Blocks the entire money step. **Flag this strongly:** the app sells digital goods (courses, books, media unlocks, gifts) funded through a wallet. *In my reading,* Apple's App Review Guideline 3.1.1 (and Google Play's payments policy) generally require the platform's billing for digital content consumed in-app; a Paystack-only wallet is a **store-rejection risk**. The owner/lawyer should verify against current guidelines and the Nigerian-market context before choosing. Don't build the money screens on an assumption.
2. **App ID.** Still the placeholder `com.meckurypro.ako` (iOS `bundleIdentifier` and Android `package`). **It cannot change after the first store publish.**
3. **BookReader PDF approach.** Suggested: `react-native-pdf` (needs a dev build — which LiveKit forces anyway), with the signed URL from `get-project-file` (**read that function's source first**). Alternatives: a WebView + pdf.js, or handing off to the OS viewer.
4. **LiveKit meetings:** go-ahead to start the dev-build work (`@livekit/react-native` + `@livekit/react-native-webrtc` + plugin). Read `mint-meeting-token` first.
5. **Apple export compliance:** `ITSAppUsesNonExemptEncryption` is **not set**. The app now uses AES at rest + HTTPS. Whether it's exempt is a legal declaration — the owner's call (don't guess it).
6. **Account deletion:** Settings only offers **deactivate** (soft delete, wallet history kept). Apple (5.1.1(v)) and Google Play both require an in-app path to *delete* an account. Raise it before submission; it needs a backend decision on what's retained for financial records.
7. **Location:** deliberately **not added** — no web feature uses it and an unused permission risks rejection. If a location feature is wanted (the BOI bus-tracker is a separate project), add it with a rationale string and a contextual ask.

---

## 7. Roadmap (priority order)

**P0 — unblock (owner)**: §6 actions 1–6, decisions 1–2.

**P1 — build without waiting** (still no decision needed):
1. **Verify the persisted query keys** (see §8, "assumed"). Cheap, and it decides whether the offline cache actually does anything.
2. **Music** (`AddMusicSheet`, discovery sheet, `PublishMusicButton`, clip selector, ProjectDetail button) — port from web, read `publish-music` source first.
3. Re-create and commit the node unit tests under `scripts/` so they survive.
4. Seed-data plan for device testing of Course/Book/Room/Ticket (tables are empty).

**P2 — after decisions**:
5. **Money step 10:** Wallet, FundWallet, Withdraw, DepositCallback (deep-link return from the payment page; Paystack or IAP per decision 1). Read `initiate-deposit` / `verify-deposit` / `process-withdrawal` sources first; payouts need `list-banks`, `resolve-bank-account`, `add-payout-account`.
6. **BookReader** (decision 3).
7. **MeetingRoom + `RoomCallView`** (decision 4): port `src/_pending/useLiveKitRoom.ts`, recording start/stop, replace the placeholder.

**P3 — step 14/15**: offline write outbox + wider caching, biometrics, on-device AI, QA/perf, universal links, permission trimming, store forms, account deletion, release.

---

## 8. Known gaps, assumptions and risks (be honest about these)

### Assumed, not verified — check first

- **React Query key roots.** `PERSISTED_QUERY_ROOTS` assumes the roots `notifications`, `page-notifications`, `conversations`, `archived-conversations`, and the foreground-push refresh invalidates `["conversations"]` and `["messages", conversationId]`. **I did not confirm these against the actual `queryKey`s in `hooks/useMessaging.ts` / `useNotifications.ts`.** If they differ, the offline cache and the live-refresh silently do nothing. `grep -n "queryKey" src/hooks/useMessaging.ts src/hooks/useNotifications.ts src/hooks/usePageNotifications.ts` and fix.
- Page-notification rows are fetched with FK name `page_notifications_actor_id_fkey` (and `notifications_actor_id_fkey`) in `openFromPush` — copied from the hooks' select strings; unconfirmed against the DB.
- `Constants.easConfig?.projectId` / `expoConfig.extra.eas.projectId` are the sources for the push project id.

### Behavioural caveats

- **Offline sign-out:** unregister is best-effort/3 s. If it fails, the old account's token row remains until another user signs in on that device (the RPC re-assigns it) or Expo reports it dead — the previous user could keep receiving pushes in that window.
- **Possible double sound** in the foreground: the OS plays the push sound *and* the app's own `SoundProvider` may play a realtime sound. Not reconciled.
- **Account-switch + push:** switching saved accounts relies on `register_push_token` re-assigning the token; the old session isn't signed out so no unregister runs. Confirm on device.
- Persisted cache hydrates **stale** data then refetches (default `staleTime: 0`) — flicker/"stale then fresh" is expected.
- `PersistGate` shows a blank view for ≤ 1.5 s on cold start while restoring.
- `Notifications` `?open=<id>` only finds notifications in the loaded page (first ~50). Fine for fresh pushes.
- iOS `aps-environment` is `development` in prebuild; EAS switches it for store profiles — confirm on the first production build.
- Android heads-up for `messages` relies on channel importance HIGH; channels are **immutable once created on a device** — change values only by adding a *new* channel id.

### Web bugs found (don't re-port them)

- Web Book builder uploads a cover but **never saves the URL** → native saves it via `useUpdateProject`.
- Web room-meeting `scheduled_at` sends a **naive datetime-local string** (read as UTC) → native sends `toISOString()`.
- Web edit screens slice UTC as local (already converted in native, from the original brief).
- Web notification type map has no entry for `comment` (blank row) → added.

### Config-plugin trap (cost real time)

Config-plugin mods apply **in reverse order**, and a plugin option of `false` can **strip a key another plugin added**. `expo-camera { microphonePermission: false }` removed `NSMicrophoneUsageDescription` that `expo-audio` had set; `expo-image-picker { microphonePermission: false }` did too. **All of `expo-camera`, `expo-audio`, `expo-image-picker` must carry the same mic string.** Re-verify with prebuild whenever plugins change.

---

## 9. Bugs found & fixed this session (for context)

1. **iOS would crash on the first voice note** — no `NSMicrophoneUsageDescription` (pre-existing; found via prebuild).
2. **Session + saved-account refresh tokens in plaintext** (pre-existing) → encrypted with migration.
3. **Chat pushes would never send** — the function is client-invoked and the native app didn't call it.
4. Tray icon: alpha-channel silhouette is a solid square (classic Android bug) → regenerated from the wordmark luminance.
5. `expo-calendar` main-entry `createEventInCalendarAsync` throws at runtime in SDK 57 → use `expo-calendar/legacy`.
6. A queued persister write could resurrect data after sign-out → write-pause flag + `dispose()`.
7. `Course` auto-complete, `Room` deletes etc. now confirm before destructive actions (deviation, below).

---

## 10. Deviations from web (keep, or tell the owner if you change them)

**From the original brief:** account menu is a bottom sheet; "+" menu is a transparent modal; page-inbox threads hide the bottom nav; profile/page screens use one list + sticky tab bar (swipe switches tab, no drag-tracking); `SwipeableTabs` panes scroll themselves; `UnlockReveal` has no blur; message long-press menu doesn't support tap-another-message multi-select; edit screens convert server UTC dates to local.

**Added this session:**
- Destructive actions **ask for confirmation** (course section/lesson, book chapter, draft discard, scheduled-post cancel, bundle of room deletes). Web deletes immediately.
- Book cover URL is **saved** to the project; reader **restores scroll position**, not just the chapter.
- Room meetings: timezone-correct timestamps, live ticking countdowns.
- Host-settings and privacy switches are native **toggles** (web used On/Off text buttons).
- Affiliate link button opens the **system share sheet** (includes Copy).
- Settings **Admin** entry opens the **web** admin in the browser.
- Password change validates length (≥ 8) in-app (no browser validation).
- Add-to-calendar uses the **OS add-event screen** (no permission), `.ics` as fallback.
- Chat **push trigger** is new behaviour (web has no push).
- Settings gained a **Notifications** section and `?section=` deep-opening.
- `FormField` gained an optional `leading` prop; new shared `ProjectList`, `ThumbRow`, `EmptyNotice`, `PostsProjectsHub`.

---

## 11. Unverified on device (carry this list into every status update)

Everything below has **never run**:

- **Navigation/gestures:** swipe tabs + indicator tracking (Saved/Liked, Feed), swipe-to-reply, hold-to-record (Room chat, classroom, DMs), back-button behaviour (reader → contents, emoji panel).
- **Keyboard:** Room screen lifting, composer padding, form scrolling in Settings/Course/Book builders, hidden-pane layout when switching Room tabs.
- **Media:** YouTube/Vimeo WebView embeds (Referer workaround), expo-video lessons, voice recorder + audio ducking, ticket image save/share.
- **Camera:** QR scanning + permission flow.
- **Reader:** scroll restore, text-size slider, theme switching, status-bar colour.
- **Push:** token registration, tap routing (cold/background/tray), foreground suppression, custom sounds, channels, badge, tray dismissal, permission card states, sign-out unregister, account-switch re-assignment.
- **Storage:** AES migration of an existing logged-in session (**highest-impact — verify first**; a bug here logs users out), SQLCipher actually engaging (`cipher_version`), offline restore, wipe-on-sign-out, reconnect refetch.
- **Calendar:** OS add-event screen on iOS and Android.
- **Settings:** username availability timing, avatar upload, theme/sound switching, deactivate → login screen, section expand animation with keyboard open.
- **Everything against the live Supabase backend** (all hooks are web copies, never exercised natively).

---

## 12. How to resume (first 10 minutes)

1. Clone both repos fresh; `cd ako.native && npm install --legacy-peer-deps`; set the local git identity.
2. Confirm baseline: `npx tsc --noEmit` (clean) and the bundle command in §2 (green). Check `git log --oneline | head` shows `fdf1a02`; `git fetch` for anything newer.
3. Don't start building. **Ask the owner** (one message): the anon key; the redirect-URL status; whether `eas init` is done; the Paystack-vs-IAP and app-ID decisions; fresh push token. Then say which P1 items you'll do while they answer (§7).
4. Owner's working style: wants **work done in priority order**, **non-decision work first, decisions later**, honest "what I built / what's unverified" reports, and best practices over literal web parity where they conflict (then tell them). Keep replies mobile-friendly (short; lead with the answer).

---

## 13. File map (new/changed this session)

```
src/screens/            Course, Book(+components/project/book/*), TicketView, EventCheckIn, Room,
                        Activity, SavedHub, LikedHub, DraftPosts, ScheduledPosts, HistoryActivity,
                        LibraryActivity, EventsActivity, MyGigs, MyAffiliateLinks, Settings, Notifications
src/components/room/    RoomChat, ClassroomTab, MeetingsTab, AssignmentsTab, HostSettingsPanel,
                        RoomMedia, RoomCallView (PLACEHOLDER), VoiceComposerOverlay
src/components/project/ LessonMedia, FeedDoorway, ProjectList, book/*
src/components/activity/ EmptyNotice, ThumbRow, PostsProjectsHub
src/components/settings/ ProfileSection, SecuritySection, PrivacySection, NotificationsSection,
                        AppearanceSection, SoundSection, AdvancedSection, SettingsParts
src/components/notifications/ ResponseModals, PushPermissionCard
src/hooks/              useMicGesture, useOwnProfile, usePushLifecycle, useActiveConversationPush,
                        usePersistedQueries   (+ edits: useMessaging, useSendMedia, useAccountAccess, useNotifications)
src/lib/                notificationChannels, notificationHandler, notificationRoute, push, pushNotify,
                        pushPermissionStore, pushState, secureStorage, secureDb, queryPersister,
                        calendar (edited), queryClient (edited), supabase (edited), accountSessions (edited)
src/theme/mono.ts
assets/notifications/   ako_message.wav, ako_activity.wav, notification-icon.png
src/_pending/           audioClip.ts, useLiveKitRoom.ts   (parked for the LiveKit/music steps)
```

---

*End of handoff. If anything here conflicts with what you observe in the repo, trust the repo and tell the owner.*
