// src/hooks/useIdentityRouteSync.ts
//
// Mounted once near the root (see app/_layout.tsx GlobalEffects). When the acting identity changes — personal ⇄ a
// page, or one page ⇄ another — and the person is sitting on a screen that belongs to the identity they just left,
// move them to the matching screen of the new one:
//
//   • on their own personal profile            → the page they switched into
//   • on the page they just switched away from → their personal profile (or the page they switched into)
//
// Without this, switching from any surface that doesn't navigate itself left the old profile on screen until the
// person navigated away and came back to the Profile tab.
//
// Screens that deliberately stay put (Compose, Create project) are never on one of those two routes, so they're
// untouched. The move waits a beat and re-checks the route first: the switcher sheet navigates on its own right
// after it dismisses, and doing both would stack a duplicate screen.
import { router, usePathname, type Href } from "expo-router";
import { useEffect, useRef } from "react";

import { useAuth } from "./useAuth";
import { useActiveIdentity } from "./usePages";

const SETTLE_MS = 700;

export function useIdentityRouteSync() {
  const { user, profile } = useAuth();
  const { data: identity } = useActiveIdentity();
  const pathname = usePathname();

  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const last = useRef<{ userId: string; key: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !profile || !identity) return;

    const key = identity.mode === "page" ? `page:${identity.page.username}` : "personal";
    const prev = last.current;
    last.current = { userId: user.id, key };
    // First read, a different account, or nothing changed: just remember it.
    if (!prev || prev.userId !== user.id || prev.key === key) return;

    const ownProfilePath = `/profile/${profile.username}`;
    const prevPagePath = prev.key.startsWith("page:") ? `/page/${prev.key.slice("page:".length)}` : null;
    const target = identity.mode === "page" ? `/page/${identity.page.username}` : ownProfilePath;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const path = pathRef.current;
      const onLeftIdentity = path === ownProfilePath || (prevPagePath !== null && path === prevPagePath);
      if (onLeftIdentity && path !== target) router.replace(target as Href);
    }, SETTLE_MS);
  }, [user, profile, identity]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}
