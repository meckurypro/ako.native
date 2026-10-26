# Google sign-in (native) — setup

Code: `src/lib/googleAuth.ts`, `src/components/ui/GoogleAuthButton.tsx` (Login + SignUp),
`src/screens/auth/OAuthReturn.tsx` / `src/app/auth/oauth.tsx` (the `ako://auth/oauth` landing screen).

It opens Google in the system auth browser and returns to the app through the `ako://` deep link — no native
Google SDK, so no SHA-1 / OAuth client per platform. It uses the **same Google Web client and Supabase
configuration as the web app**; the provider setup (Google Cloud console, Supabase Google provider, database
SQL) is in the web repo's `docs/GOOGLE_AUTH_SETUP.md`. Native-specific parts:

1. **Redirect URLs** — add **both** `ako://auth/oauth` (Google) and `ako://auth/callback` (email confirmation,
   password reset) to Supabase → Authentication → URL Configuration → Redirect URLs. They must match what the app
   sends *exactly*: the app builds them with `appLink()` (`src/lib/authLink.ts`), which yields `ako://auth/oauth`.
   `Linking.createURL("/auth/oauth")` (leading slash) yields `ako:///auth/oauth` in a release build, which does not
   match; Supabase then silently falls back to the Site URL and the in-app browser lands on the website instead of
   returning to the app. Symptom: after Google, the auth browser stays open showing `myako.site` signed in.
2. **New build required** — `expo-web-browser` is a new native module, so this changes the fingerprint and an
   OTA update will not deliver it. Run `npm install --legacy-peer-deps`, then `npm run build:apk` (SETUP.md §5).
   Until a build with it is installed, the Google button will fail.
3. Not offered in "add another account" mode (`add=1`), same reason as web.
4. **Android: keep the auth browser in the app's task** — `signInWithGoogle` passes `{ createTask: false }` to
   `openAuthSessionAsync` (expo-web-browser's documented option), so the Custom Tab shares the app's task and the
   `ako://auth/oauth` redirect pops it off the stack. JS-only (OTA-safe); iOS ignores it. This only helps once the
   redirect actually reaches the app (step 1). If the tab ever lingers, check the app's `MainActivity` is still
   `launchMode="singleTask"` (Expo's default).

## Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| After Google, the browser shell stays open and shows the web app (`myako.site`) | Supabase did not accept `redirect_to` and used the Site URL | Check Redirect URLs contain `ako://auth/oauth` and `ako://auth/callback` exactly; never build them with a leading slash (use `appLink()`) |
| Email confirmation / reset link opens the website, not the app | Same, for `ako://auth/callback` | Same |
