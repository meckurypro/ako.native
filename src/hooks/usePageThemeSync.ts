// src/hooks/usePageThemeSync.ts
// Mounted once near the root (see src/app/_layout.tsx). Keeps the app palette
// (personal vs Page / burnt-orange) in step with the real, server-confirmed
// identity — the source of truth for anything the persisted launch hint can't
// cover (identity changed from another device, a stale hint, etc).
//
// The launch hint itself ("ako-active-mode") is read synchronously by
// ThemeProvider on the very first render, which is what prevents a flash of
// the wrong palette on cold start — the native counterpart of the web build's
// inline pre-mount script.
import { useLayoutEffect } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { useAuth } from "./useAuth";
import { useActiveIdentity } from "./usePages";

export function usePageThemeSync() {
  const { user } = useAuth();
  const { data: identity } = useActiveIdentity();
  const { pageMode, pageModeOwner, setPageMode } = useTheme();
  const isPageMode = identity?.mode === "page";

  // The page palette on screen belongs to someone else (a previous account on
  // this device, a stale legacy hint) or to nobody (signed out): drop it now,
  // before the new account's identity has loaded, instead of letting it show.
  useLayoutEffect(() => {
    if (pageMode && (!user || pageModeOwner !== user.id)) setPageMode(false, user?.id);
  }, [user, pageMode, pageModeOwner, setPageMode]);

  useLayoutEffect(() => {
    if (!identity || !user) return; // still loading — don't overwrite the hint with a guess
    if (pageMode !== isPageMode || (isPageMode && pageModeOwner !== user.id)) setPageMode(isPageMode, user.id);
  }, [identity, isPageMode, pageMode, pageModeOwner, user, setPageMode]);
}
