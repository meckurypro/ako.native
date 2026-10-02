// src/hooks/useBackDismiss.ts
// Native port. The web version pushed a history entry per open overlay so the
// browser/system Back button closed the overlay instead of leaving the page.
// On Android that role belongs to the hardware/gesture Back button; BackHandler
// calls registered handlers last-in-first-out, so the top-most overlay closes
// first — the same stacking behaviour the history trick gave the web.
// iOS has no system Back, so this is a no-op there (overlays close via their
// own backdrop tap / swipe-down / close button).
import { useEffect, useRef } from "react";
import { BackHandler, InteractionManager } from "react-native";

export function useBackDismiss(onClose: () => void, enabled: boolean = true) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onCloseRef.current();
      return true; // consume — don't also pop the screen underneath
    });
    return () => sub.remove();
  }, [enabled]);
}

/**
 * Close an overlay, then run `action` once the dismissal has settled — used
 * when the action navigates (so the push doesn't race the overlay's exit
 * animation). Web waited on `popstate`; native waits for interactions/animations
 * to finish, with a short timer as a safety net.
 */
const DISMISS_FALLBACK_MS = 200;

export function runAfterDismiss(close: () => void, action: () => void) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(fallback);
    action();
  };
  const fallback = setTimeout(finish, DISMISS_FALLBACK_MS);
  close();
  InteractionManager.runAfterInteractions(finish);
}
