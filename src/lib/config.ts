// src/lib/config.ts
// Public app origin used to build shareable web links (posts, projects,
// profiles). Set EXPO_PUBLIC_APP_URL in .env — e.g. https://your-domain.
// Without it, link helpers return a path only rather than a wrong domain.
export const APP_URL = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
