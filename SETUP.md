# SETUP.md

One-time setup for building the APK and OTA updates. Commands are run from the repo root.

## 1. Install
```sh
npm install --legacy-peer-deps
npm install -g eas-cli
eas login
```

## 2. Link to EAS (writes extra.eas.projectId and updates.url into app.json)
```sh
eas init
eas update:configure
```
Commit the changed app.json before building.

## 3. Environment variables (EAS, environment "preview")
```sh
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://nokuwkxosyegaexlzdsl.supabase.co --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --environment preview --visibility sensitive
eas env:set --name EXPO_PUBLIC_APP_URL --value https://myako.site --environment preview --visibility plaintext
```

## 4. GitHub secret
Repo Settings > Secrets and variables > Actions > New secret: `EXPO_TOKEN`
(token from expo.dev > Account settings > Access tokens).

## 4b. Push notifications (Android) — required, one-time
`google-services.json` only configures the *app*. For Expo's push service to deliver to Android it also needs a
Firebase **service-account key (FCM V1)** uploaded to EAS. Without it every push fails at Expo with
`InvalidCredentials: Unable to retrieve the FCM server key` and the phone shows nothing (no tray, sound, vibration or badge).

1. Firebase console → project **ako-by-meckury** → Project settings → **Service accounts** → *Generate new private key* (downloads a JSON).
2. Upload it to EAS:
   ```sh
   eas credentials -p android
   # → production → Google Service Account → Manage your Google Service Account Key for Push Notifications (FCM V1)
   # → Set up a Google Service Account Key for Push Notifications (FCM V1) → Upload a new service account key
   ```
   (Or expo.dev → project → Credentials → Android → *Service Credentials* → FCM V1.) Don't commit the JSON.
3. No rebuild is needed for this step — it takes effect on the next push. Re-run `eas credentials -p android` to confirm the key shows as assigned.

Android channels are versioned (`messages_v2`, `activity_v2`, `general_v2`); the edge functions target the same ids. See `src/lib/notificationChannels.ts`.
To verify on a phone: Settings → Notifications → **Send a test notification** (local; checks permission, sound, vibration, tray), and check the *Push status* line there.

## 5. Build the APK (once, and again after any native change)
```sh
npm run build:apk
```

## 6. Day to day
Push UI/JS changes to `main`. The "EAS Update" workflow typechecks, then publishes to the
`preview` channel. Open the APK, let it download, close and reopen to apply.
A new native package, plugin or native app.json field changes the fingerprint and needs a new APK.

## 7. Deep links (open shared links in the app)
Full guide — accounts, `.well-known` files, SHA-256 / Team ID, testing: [`docs/DEEP_LINKING_SETUP.md`](docs/DEEP_LINKING_SETUP.md).
The `app.json` link config is a native change: it needs a new build (`npm run build:apk`), not an OTA update.
