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
import { useActiveIdentity } from "./usePages";

export function usePageThemeSync() {
  const { data: identity } = useActiveIdentity();
  const { pageMode, setPageMode } = useTheme();
  const isPageMode = identity?.mode === "page";

  useLayoutEffect(() => {
    if (!identity) return; // still loading — don't overwrite the hint with a guess
    if (pageMode !== isPageMode) setPageMode(isPageMode);
  }, [identity, isPageMode, pageMode, setPageMode]);
}
