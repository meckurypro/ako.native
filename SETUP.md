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
eas env:set --name EXPO_PUBLIC_APP_URL --value https://ako-lime.vercel.app --environment preview --visibility plaintext
```

## 4. GitHub secret
Repo Settings > Secrets and variables > Actions > New secret: `EXPO_TOKEN`
(token from expo.dev > Account settings > Access tokens).

## 5. Build the APK (once, and again after any native change)
```sh
npm run build:apk
```

## 6. Day to day
Push UI/JS changes to `main`. The "EAS Update" workflow typechecks, then publishes to the
`preview` channel. Open the APK, let it download, close and reopen to apply.
A new native package, plugin or native app.json field changes the fingerprint and needs a new APK.
