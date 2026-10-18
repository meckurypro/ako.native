# Google sign-in (native) — setup

Code: `src/lib/googleAuth.ts`, `src/components/ui/GoogleAuthButton.tsx` (Login + SignUp),
`src/screens/auth/OAuthReturn.tsx` / `src/app/auth/oauth.tsx` (the `ako://auth/oauth` landing screen).

It opens Google in the system auth browser and returns to the app through the `ako://` deep link — no native
Google SDK, so no SHA-1 / OAuth client per platform. It uses the **same Google Web client and Supabase
configuration as the web app**; the provider setup (Google Cloud console, Supabase Google provider, database
SQL) is in the web repo's `docs/GOOGLE_AUTH_SETUP.md`. Native-specific parts:

1. **Redirect URL** — add `ako://auth/oauth` to Supabase → Authentication → URL Configuration → Redirect URLs.
2. **New build required** — `expo-web-browser` is a new native module, so this changes the fingerprint and an
   OTA update will not deliver it. Run `npm install --legacy-peer-deps`, then `npm run build:apk` (SETUP.md §5).
   Until a build with it is installed, the Google button will fail.
3. Not offered in "add another account" mode (`add=1`), same reason as web.
