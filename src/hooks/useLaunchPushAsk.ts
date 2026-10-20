// src/hooks/useLaunchPushAsk.ts
// Upfront notification prompt, shown right AFTER SIGN-IN. Mounted at the ROOT (so it isn't tied to one screen
// group) but gated by the caller on a signed-in user: a brand-new install is asked the moment the person has
// signed in and the branded splash has lifted — not on the welcome / login screen, and never for a signed-out
// guest — instead of leaving them to find a card on the Notifications page and miss their first messages.
// One OS request covers everything push needs: alerts, badge and sound on iOS, POST_NOTIFICATIONS on Android 13+
// (the Android channels are created first — see askForPushPermission).
//
//   • asks once per install: the flag is written only AFTER the OS has actually answered, so a prompt that
//     couldn't show (app not in the foreground, OS hiccup) is retried on the next launch. The permission belongs
//     to the device, not the account, so signing in as someone else never asks twice
//   • never asks again if the user already answered, or if the OS won't show the prompt any more
//     (later asks live in the Notifications card / Settings)
//   • the push TOKEN is minted and attached to the account by usePushRegistration, which reacts to the shared
//     permission store — so it registers the moment the person taps Allow
import { useEffect } from "react";
import { AppState } from "react-native";

import { askForPushPermission, usePushPermission } from "../lib/pushPermissionStore";

const ASKED_KEY = "ako-push-first-ask-done";
const LAUNCH_ASK_DELAY_MS = 800;

/** @param active false while the splash / boot UI is still covering the screen, or while nobody is signed in. */
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
