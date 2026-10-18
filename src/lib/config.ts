// src/lib/config.ts
// Public app origin used to build shareable web links (posts, projects,
// profiles). Defaults to the production domain so share links are never
// path-only or on a *.vercel.app host; override with EXPO_PUBLIC_APP_URL.
export const DEFAULT_APP_URL = "https://myako.site";
export const APP_URL = (process.env.EXPO_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL).replace(/\/+$/, "");
