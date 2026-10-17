// src/lib/pushLaunch.ts
// Was this app process started, or brought forward, by tapping a notification?
//
// Evaluated when the module is first imported (from notificationHandler, at startup), i.e. BEFORE any screen
// mounts and before anything can clear the "last notification response". useRouteMemory asks this instead of
// asking expo-notifications at some later moment: the tap handler clears the response as soon as it has read it,
// and a later check would see nothing and restore the last-visited screen on top of the notification's page.
import * as Notifications from "expo-notifications";

let openedFromPush = false;
try {
  openedFromPush = Notifications.getLastNotificationResponse() != null;
} catch {
  /* can't tell: treat as a normal launch */
}

/** Called by the tap handler the moment it accepts a notification tap. */
export function markPushTap(): void {
  openedFromPush = true;
}

export function appOpenedFromPush(): boolean {
  return openedFromPush;
}
