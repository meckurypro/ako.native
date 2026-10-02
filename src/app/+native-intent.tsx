// src/app/+native-intent.tsx
// Rewrites incoming deep links before routing. Share links use the web app's
// URLs (https://<web-domain>/post/…, /profile/…, /projects/…), and the custom
// scheme uses the same paths (ako://post/…), so both resolve to one route
// table. Anything unrecognised falls through to +not-found.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path);
    const webHost = process.env.EXPO_PUBLIC_APP_URL ? new URL(process.env.EXPO_PUBLIC_APP_URL).host : null;
    const isWeb = (url.protocol === "https:" || url.protocol === "http:") && !!webHost && url.host === webHost;
    const isScheme = url.protocol === "ako:";

    if (isWeb) return `${url.pathname}${url.search}`;
    if (isScheme) {
      // ako://post/123 parses with "post" as the host; rebuild the full path.
      const pathname = url.host ? `/${url.host}${url.pathname === "/" ? "" : url.pathname}` : url.pathname;
      return `${pathname}${url.search}`;
    }
  } catch {
    // Already a bare path like "/feed" — leave as is.
  }
  return path;
}
