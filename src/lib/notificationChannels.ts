// src/lib/notificationChannels.ts
// Android notification channels. On Android 8+ the CHANNEL — not the push payload — decides sound,
// vibration, heads-up and badge behaviour, and a channel is immutable once created on a device (only the
// user can change it in system settings). So these ids are versioned: to change a channel's sound,
// importance or vibration, introduce a NEW id here AND in the backend (send-message-push,
// send-activity-push, which target "messages_v2" / "activity_v2").
//
// v2: sounds are the phone's own default notification sound (like every other app), vibration is explicit
// on every channel (a channel created without it is silent-vibrate on many devices), and the fallback
// channel is HIGH so an unrecognised push still alerts instead of arriving silently.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const CHANNEL_MESSAGES = "messages_v2";
export const CHANNEL_ACTIVITY = "activity_v2";
/** Also set as the FCM default channel in app.json (expo-notifications `defaultChannel`). */
export const CHANNEL_DEFAULT = "general_v2";

/** v1 ids: custom-sound channels, and a "default" channel with no sound/vibration. Removed so Settings isn't cluttered. */
const LEGACY_CHANNELS = ["messages", "activity", "default"];

const BRAND_LIGHT = "#3D5A45";
const VIBRATION = [0, 250, 250, 250];

let ensured: Promise<void> | null = null;

/** Idempotent. Must run BEFORE the first permission prompt: Android 13+ only shows the prompt once a channel exists. */
export function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  ensured ??= (async () => {
    const { AndroidImportance, AndroidNotificationVisibility } = Notifications;
    await Promise.all(LEGACY_CHANNELS.map((id) => Notifications.deleteNotificationChannelAsync(id).catch(() => {})));
    await Promise.all([
      Notifications.setNotificationChannelAsync(CHANNEL_MESSAGES, {
        name: "Messages",
        description: "New direct and group messages",
        importance: AndroidImportance.HIGH, // heads-up banner
        sound: "default", // the phone's own notification sound
        enableVibrate: true,
        vibrationPattern: VIBRATION,
        enableLights: true,
        lightColor: BRAND_LIGHT,
        lockscreenVisibility: AndroidNotificationVisibility.PRIVATE, // hidden only if the user hides sensitive content
        showBadge: true,
      }),
      Notifications.setNotificationChannelAsync(CHANNEL_ACTIVITY, {
        name: "Activity",
        description: "Follows, comments, mentions, gifts, purchases and invites",
        importance: AndroidImportance.HIGH, // heads-up too: people expect to be pinged for these
        sound: "default",
        enableVibrate: true,
        vibrationPattern: VIBRATION,
        enableLights: true,
        lightColor: BRAND_LIGHT,
        lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
        showBadge: true,
      }),
      // Fallback for any push that arrives without (or with an unknown) channel.
      Notifications.setNotificationChannelAsync(CHANNEL_DEFAULT, {
        name: "General",
        importance: AndroidImportance.HIGH,
        sound: "default",
        enableVibrate: true,
        vibrationPattern: VIBRATION,
        lightColor: BRAND_LIGHT,
        lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
        showBadge: true,
      }),
    ]);
  })().catch((e) => {
    ensured = null; // allow a retry
    if (__DEV__) console.warn("[push] couldn't create notification channels", e);
  });
  return ensured;
}
