// src/app/+native-intent.tsx
// Rewrites incoming deep links before routing. Share links use the web app's
// URLs (https://<web-domain>/post/…, /profile/…, /projects/…), and the custom
// scheme uses the same paths (ako://post/…), so both resolve to one route
// table. Anything unrecognised falls through to +not-found.
import { APP_URL } from "@/lib/config";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path);
    const webHost = new URL(APP_URL).host;
    const isWeb = (url.protocol === "https:" || url.protocol === "http:") && !!webHost && url.host === webHost;
    const isScheme = url.protocol === "ako:";

    // Comments are pages of their own: /post/<id>/comment/<commentId> routes as-is. Older links used
    // /post/<id>#comment-<commentId>; forward those to the comment page.
    const commentMatch = /^#comment-(.+)$/.exec(url.hash);
    const withComment = (path: string, search: string) => {
      const post = commentMatch ? /^\/post\/([^/]+)\/?$/.exec(path) : null;
      return post ? `/post/${post[1]}/comment/${commentMatch![1]}${search}` : `${path}${search}`;
    };

    if (isWeb) return withComment(url.pathname, url.search);
    if (isScheme) {
      // ako://post/123 parses with "post" as the host; rebuild the full path.
      const pathname = url.host ? `/${url.host}${url.pathname === "/" ? "" : url.pathname}` : url.pathname;
      return withComment(pathname, url.search);
    }
  } catch {
    // Already a bare path like "/feed" — leave as is.
  }
  return path;
}
