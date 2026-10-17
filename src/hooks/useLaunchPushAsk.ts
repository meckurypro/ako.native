// src/hooks/useLaunchPushAsk.ts
// First-launch notification prompt. Mounted at the ROOT (not behind sign-in), so a brand-new install is asked
// as soon as the branded splash lifts — on the welcome / login screen, before an account even exists —
// instead of waiting for the user to sign in and then find a card on the Notifications page.
//
//   • asks once per install: the flag is written only AFTER the OS has actually answered, so a prompt that
//     couldn't show (app not in the foreground, OS hiccup) is retried on the next launch
//   • never asks again if the user already answered, or if the OS won't show the prompt any more
//     (later asks live in the Notifications card / Settings)
//   • the push TOKEN is still minted and attached to the account after sign-in (usePushRegistration reacts
//     to the shared permission store), so granting here works even though nobody is signed in yet
import { useEffect } from "react";
import { AppState } from "react-native";

import { askForPushPermission, usePushPermission } from "../lib/pushPermissionStore";

const ASKED_KEY = "ako-push-first-ask-done";
const LAUNCH_ASK_DELAY_MS = 800;

/** @param active false while the splash / boot UI is still covering the screen. */
export function useLaunchPushAsk(active: boolean) {
  const { status, canAskAgain, loaded } = usePushPermission();

  useEffect(() => {
    if (!active || !loaded) return;
    if (status !== "undetermined" || !canAskAgain) return;
    if (localStorage.getItem(ASKED_KEY)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ask = () => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        // The Android 13+ / iOS prompt needs a foregrounded app.
        if (AppState.currentState !== "active") return;
        try {
          const result = await askForPushPermission();
          // Only count it as asked once the OS really answered.
          if (result.status !== "undetermined") localStorage.setItem(ASKED_KEY, "1");
        } catch {
          /* try again next launch */
        }
      }, LAUNCH_ASK_DELAY_MS);
    };

    if (AppState.currentState === "active") ask();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && !timer) ask();
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [active, loaded, status, canAskAgain]);
}
