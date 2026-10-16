# Deep Linking Setup — open shared Akọ links in the installed app

A shared link such as `https://ako-lime.vercel.app/my-project` (or `/projects/<id>`) should open the **Akọ app** when it is installed, and the **website** when it is not. This document covers every step, who needs which account, how to test, and what is already done in the code.

> Applies to both repositories:
> - Web: `meckurypro/ako` (React + Vite on Vercel)
> - Native: `meckurypro/Ako.native` (Expo / expo-router)

---

## 1. How it works

| Piece | What it is | Platform | Needs a paid store account? |
|---|---|---|---|
| **Universal Links** | Verified `https://` links the OS hands to your app | iOS | Yes (Apple Developer Program) |
| **App Links** | Verified `https://` links the OS hands to your app | Android | Only to *publish*; you can test with a sideloaded build |
| **Custom scheme** `ako://` | An app-specific URL (`ako://projects/123`) | Both | No |

"Verified" means the domain publishes a file that names your app, and the app declares the domain. The OS checks both directions, then opens the app directly with no chooser.

```
Tap https://ako-lime.vercel.app/my-project
        │
        ├─ app installed + domain verified ──► OS opens Akọ ──► +native-intent.tsx maps URL → route
        │                                                         ├─ signed in  → project page (full)
        │                                                         └─ signed out → project page (guest view)
        └─ not installed / not verified ─────► browser opens the website (same page, guest view on web)
```

The custom scheme is a fallback for "Open in app" buttons. It does nothing if the app is not installed, and any app can claim a scheme, so never rely on it as the main shareable link.

---

## 2. Identifiers used in this project

| Item | Value | Where it comes from |
|---|---|---|
| Web domain | `ako-lime.vercel.app` | `Native-Hand-off.md`, `EXPO_PUBLIC_APP_URL` |
| iOS bundle identifier | `com.meckurypro.ako` | `app.json → expo.ios.bundleIdentifier` |
| Android package | `com.meckurypro.ako` | `app.json → expo.android.package` |
| URL scheme | `ako` | `app.json → expo.scheme` |
| Expo owner / project | `meckury` / `ebe5d175-1ab8-47d2-85c8-099e5eea4575` | `app.json` |
| **Apple Team ID** | *you get this when you enrol* | https://developer.apple.com/account → Membership details |
| **Android SHA-256 fingerprint(s)** | *you get these from EAS / Play Console* | See §5 |

---

## 3. What is already done in the code

**Native (`Ako.native`)**
- `app.json` declares the domain for both platforms:
  - `ios.associatedDomains = ["applinks:ako-lime.vercel.app"]`
  - `android.intentFilters` with `autoVerify: true` for `https://ako-lime.vercel.app`
- `src/app/+native-intent.tsx` rewrites incoming `https://ako-lime.vercel.app/...` and `ako://...` URLs into route paths. It only rewrites URLs whose host equals the host of `EXPO_PUBLIC_APP_URL`, so keep that variable set to the same domain.
- `src/lib/guestRoutes.ts` + `src/app/(app)/_layout.tsx`: a **signed-out** visitor who opens a project link is shown the project page instead of being bounced to login. Every other screen is still behind sign-in.
- `src/screens/ProjectDetail.tsx` + `src/components/project/ProjectCard.tsx`: the logged-out project page (see §8).
- Login and Sign-up already accept `?redirect=/path`, so after authenticating the person lands back on the same project.

**Web (`ako`)**
- `vercel.json` serves `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` as `application/json`.
- The logged-out project page was already cleaned up (single login/sign-up in the top bar, no creator card, details behind a "Details" button).

**Still to do (needs accounts or values only you have):** the two `.well-known` files, a new native build, and the store listings. Steps below.

---

## 4. Accounts you need

| Account | Cost | Needed for | Link |
|---|---|---|---|
| Expo (EAS) | Free tier available | Building the app, managing signing keys | https://expo.dev/signup |
| Google Play Console | One-time US$25 | Publishing on Play; Play App Signing key fingerprint | https://play.google.com/console/signup |
| Apple Developer Program | US$99 / year | Universal Links entitlement, TestFlight, App Store | https://developer.apple.com/programs/enroll/ |

Notes:
- Google may require new personal accounts to run a closed test with a minimum number of testers for a minimum period before production access. Check the current rule in the Play Console help before planning a launch date.
- Apple enrolment can take a day or more to be approved.
- A free Apple ID cannot use the Associated Domains capability, so iOS Universal Links cannot be tested on a device without the paid program.

### What you can do today without any store account
- Use the `ako://` scheme and expo-router mapping (works in dev builds).
- Build an Android APK with EAS (`npm run build:apk`) and sideload it; App Links verification only needs the signing-certificate fingerprint, not a Play account.
- Host both `.well-known` files on the web domain.

---

## 5. Android — App Links

### 5.1 Get the SHA-256 certificate fingerprint(s)

You may need up to two fingerprints. List them all in `assetlinks.json`.

**A. EAS-managed keystore** (used by `preview` APK builds and as the upload key for production)
```sh
eas credentials -p android
# choose the build profile (preview / production) → Keystore → look for "SHA256 Fingerprint"
```
Docs: https://docs.expo.dev/app-signing/app-credentials/

**B. Play App Signing key** (only after the app exists in Play Console; Google re-signs the app you upload with its own key)
1. Open https://play.google.com/console and select the app.
2. Go to **Test and release → App integrity → App signing** (menu labels move around; search "App signing key certificate").
3. Copy the **SHA-256 certificate fingerprint** of the *App signing key certificate* (not the upload key).

### 5.2 Create `assetlinks.json` in the web repo

Path: `public/.well-known/assetlinks.json` (in `meckurypro/ako`)

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.meckurypro.ako",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:...:FF   // EAS keystore fingerprint (A)",
        "11:22:33:...:99   // Play App Signing fingerprint (B), add after first Play upload"
      ]
    }
  }
]
```
Remove the `//` comments — JSON does not allow them. Fingerprints are uppercase, colon-separated hex.

Deploy (push to `main`), then confirm:
```sh
curl -i https://ako-lime.vercel.app/.well-known/assetlinks.json
```
Expect `200`, `content-type: application/json`, and no redirect.

Validate with Google's API (should list your package):
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://ako-lime.vercel.app&relation=delegate_permission/common.handle_all_urls
```
Tester UI: https://developers.google.com/digital-asset-links/tools/generator

### 5.3 Build and install
The `app.json` intent filter is a native change, so a **new APK is required** (OTA updates cannot add it).
```sh
npm run build:apk          # eas build --platform android --profile preview
```
Install the APK on a phone.

### 5.4 Test
```sh
adb shell pm verify-app-links --re-verify com.meckurypro.ako
adb shell pm get-app-links com.meckurypro.ako
# expect: ako-lime.vercel.app: verified

adb shell am start -a android.intent.action.VIEW -d "https://ako-lime.vercel.app/projects/<a-real-project-id>"
```
Also tap the link from WhatsApp, Notes or Gmail. (Typing it in the Chrome address bar normally stays in the browser.)

Official guide: https://developer.android.com/training/app-links/verify-android-applinks
Expo guide: https://docs.expo.dev/linking/android-app-links/

---

## 6. iOS — Universal Links

### 6.1 Enrol and find your Team ID
1. Enrol: https://developer.apple.com/programs/enroll/
2. Team ID: https://developer.apple.com/account → **Membership details** (10 characters, e.g. `ABCDE12345`).

### 6.2 Create the association file in the web repo

Path: `public/.well-known/apple-app-site-association` — **no file extension**.

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["ABCDE12345.com.meckurypro.ako"],
        "components": [
          { "/": "/admin/*", "exclude": true },
          { "/": "/*" }
        ]
      }
    ]
  }
}
```
- Replace `ABCDE12345` with your real Team ID.
- Rules are evaluated top to bottom; put exclusions first. Add any web-only paths you do not want opening the app.
- It must be served over HTTPS, with no redirects, as `application/json` (handled by `vercel.json`).

Deploy, then confirm:
```sh
curl -i https://ako-lime.vercel.app/.well-known/apple-app-site-association
```
Apple fetches this through its CDN, so also check what Apple sees (may lag by hours):
```
https://app-site-association.cdn-apple.com/a/v1/ako-lime.vercel.app
```
Reference: https://developer.apple.com/documentation/bundleresources/applinks

### 6.3 Build with the entitlement
`app.json` already contains `associatedDomains`. EAS registers the capability on your App ID when you build with a paid account.
```sh
eas build --platform ios --profile production      # or a development/preview profile with internal distribution
```
Docs: https://docs.expo.dev/linking/ios-universal-links/ and https://developer.apple.com/documentation/xcode/supporting-associated-domains

### 6.4 Test
- Send yourself the link in **Notes** or **Messages**, then tap it. (Pasting it into Safari's address bar will not trigger it.)
- Long-press a link: Apple shows **Open in Akọ** when the association works.
- If the app was installed before the AASA file was live, delete and reinstall so iOS re-fetches it.
- Development builds can use `applinks:ako-lime.vercel.app?mode=developer` together with Settings → Developer → Associated Domains Development to bypass the CDN cache.

---

## 7. How the app resolves a link

`src/app/+native-intent.tsx` turns any of these into a route:

| Incoming | Route |
|---|---|
| `https://ako-lime.vercel.app/my-project` | `/my-project` → `(app)/[slug].tsx` → `ProjectBySlug` |
| `https://ako-lime.vercel.app/projects/<id>` | `(app)/projects/[projectId]/index.tsx` |
| `ako://projects/<id>` | same as above |
| `https://ako-lime.vercel.app/post/<id>#comment-<cid>` | `/post/<id>?comment=<cid>` |

Rewrites only apply when the URL host equals the host of `EXPO_PUBLIC_APP_URL`. Set it in EAS (see `SETUP.md` §3).

Any URL the app does not recognise falls through to `+not-found`. Because the Android intent filter claims the whole domain, a web-only page (for example `/admin`) would open the app's not-found screen on Android. Keep web-only pages off the domain, or accept that behaviour; iOS can exclude paths in the AASA file (see §6.2).

---

## 8. The signed-out project page (native)

When a signed-out person opens a project link in the app:

1. `(app)/_layout.tsx` checks `isGuestProjectPath(pathname)` (`src/lib/guestRoutes.ts`). Only `/projects/:id` and a custom `/:slug` qualify; `/projects/new`, `/feed`, `/settings` and every other route still redirect to login.
2. A minimal shell renders (no bottom nav, no push registration, no offline cache).
3. `ProjectDetail` shows:
   - top bar: logo, **Log in**, **Sign up** (one place only)
   - the project artwork, title, price
   - a **Details** button; description, event/gig/FAQ/reviews/topics stay hidden until tapped
   - the main action button (Read, Listen, Download, Get ticket, Buy…) always at the bottom of the card
   - no creator card, no "More from…", no "Similar contents", no bottom login panel
4. Any action (main button, Save, Gift, Support, Message) calls `router.replace('/login?redirect=<this page>')`.
5. After login or sign-up (including onboarding) the person is sent back to the same project page.

---

## 9. Optional: "Open in app" on the website

Do this after the apps are in the stores (you need the store IDs).

**iOS Smart App Banner** — add to `index.html` (or set per page):
```html
<meta name="apple-itunes-app" content="app-id=YOUR_APP_STORE_ID">
```
Get the ID from https://appstoreconnect.apple.com after creating the app record.

**Android** — Chrome opens verified App Links by itself when the link is tapped from another app. For an explicit button on the page:
```
intent://ako-lime.vercel.app/projects/<id>#Intent;scheme=https;package=com.meckurypro.ako;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.meckurypro.ako;end
```

**Any platform (installed users only)** — `ako://projects/<id>`.

Store URLs:
- Google Play: `https://play.google.com/store/apps/details?id=com.meckurypro.ako`
- App Store: `https://apps.apple.com/app/idYOUR_APP_STORE_ID`

**In-app browsers** (Instagram, Facebook, TikTok) often ignore verified links. Show an "Open in browser" hint there.

**Deferred deep linking** (open the right project *after* a fresh install) is not provided by plain links. Services such as Branch (https://www.branch.io) or AppsFlyer (https://www.appsflyer.com) do this.

---

## 10. Move to a custom domain (recommended before launch)

`*.vercel.app` works, but a domain you own is safer for store listings and lets you change hosts later without re-shipping the app. If you change domain, update **all** of:
1. Vercel: add the domain (https://vercel.com/docs/projects/domains).
2. EAS env `EXPO_PUBLIC_APP_URL` (see `SETUP.md` §3).
3. `app.json`: `ios.associatedDomains` and the Android intent-filter `host`.
4. Both `.well-known` files must be served on the new host.
5. Build a new native binary (the domain list is compiled into the app).

---

## 11. Step-by-step checklist

**Now (free)**
- [x] `app.json` domains + intent filter
- [x] `+native-intent.tsx` URL mapping
- [x] Logged-out project page in the app
- [x] `vercel.json` JSON headers for `.well-known`
- [ ] Merge/deploy the web repo so headers are live

**Android (after you have a build)**
- [ ] `eas credentials -p android` → copy SHA-256
- [ ] Create `public/.well-known/assetlinks.json` in the web repo, push, check with `curl` and the Google API
- [ ] `npm run build:apk`, install, run the `adb` checks in §5.4
- [ ] Create Play Console app, upload the build, add the Play App Signing fingerprint to `assetlinks.json`

**iOS (after enrolling)**
- [ ] Copy Team ID
- [ ] Create `public/.well-known/apple-app-site-association` in the web repo, push, check with `curl` and Apple's CDN URL
- [ ] `eas build --platform ios`, install via TestFlight, test from Notes/Messages
- [ ] Create the App Store Connect record, note the App Store ID

**Polish**
- [ ] Smart App Banner and "Open in app" button (§9)
- [ ] Custom domain (§10)

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Link opens the browser on Android | Not verified | Run `adb shell pm get-app-links com.meckurypro.ako`; fingerprint in `assetlinks.json` must match the *installed* build's signing key (EAS vs Play) |
| `assetlinks.json` returns HTML | SPA rewrite swallowed it | The file must exist under `public/.well-known/`; check `curl -i` shows `application/json` |
| Link opens the browser on iOS | Typed into Safari, or AASA not fetched yet | Tap it from Notes/Messages; reinstall; check Apple CDN URL |
| AASA `301/302` | Redirect on the file | Serve it directly at `/.well-known/apple-app-site-association` over HTTPS |
| App opens but shows "not found" | Host mismatch or unknown path | `EXPO_PUBLIC_APP_URL` host must equal the link host; check §7 |
| Signed-out person lands on login, not the project | Path not recognised as a project path | Check `isGuestProjectPath` and `RESERVED_PROJECT_SLUGS` |
| Changed `app.json` link config but nothing changed | Native change needs a new build | Rebuild; OTA updates do not apply it |

---

## 13. Reference links

- Expo linking overview: https://docs.expo.dev/linking/overview/
- Expo Android App Links: https://docs.expo.dev/linking/android-app-links/
- Expo iOS Universal Links: https://docs.expo.dev/linking/ios-universal-links/
- Expo Router native intent: https://docs.expo.dev/router/advanced/native-intent/
- EAS credentials: https://docs.expo.dev/app-signing/app-credentials/
- EAS Submit: https://docs.expo.dev/submit/introduction/
- Android: verify App Links: https://developer.android.com/training/app-links/verify-android-applinks
- Digital Asset Links tester: https://developers.google.com/digital-asset-links/tools/generator
- Apple: Supporting associated domains: https://developer.apple.com/documentation/xcode/supporting-associated-domains
- Apple: `applinks` / AASA format: https://developer.apple.com/documentation/bundleresources/applinks
- Apple CDN check: https://app-site-association.cdn-apple.com/a/v1/ako-lime.vercel.app
- Play Console: https://play.google.com/console
- App Store Connect: https://appstoreconnect.apple.com
