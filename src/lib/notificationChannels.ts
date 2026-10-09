// src/lib/notificationChannels.ts
// Android notification channels. The IDs and sound names are fixed by the backend: send-message-push
// targets channel "messages" + ako_message.wav, send-activity-push targets "activity" + ako_activity.wav.
// Android channels are immutable once created on a device (only the user can change them in system
// settings), so change these values only by introducing a NEW channel id.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const CHANNEL_MESSAGES = "messages";
export const CHANNEL_ACTIVITY = "activity";
export const CHANNEL_DEFAULT = "default";

const BRAND_LIGHT = "#3D5A45";

let ensured: Promise<void> | null = null;

/** Idempotent. Must run BEFORE the first permission prompt: Android 13+ only shows the prompt once a channel exists. */
export function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  ensured ??= (async () => {
    const { AndroidImportance, AndroidNotificationVisibility } = Notifications;
    await Promise.all([
      Notifications.setNotificationChannelAsync(CHANNEL_MESSAGES, {
        name: "Messages",
        description: "New direct and group messages",
        importance: AndroidImportance.HIGH, // heads-up banner
        sound: "ako_message.wav",
        vibrationPattern: [0, 200, 120, 200],
        lightColor: BRAND_LIGHT,
        lockscreenVisibility: AndroidNotificationVisibility.PRIVATE, // hidden only if the user hides sensitive content
        showBadge: true,
      }),
      Notifications.setNotificationChannelAsync(CHANNEL_ACTIVITY, {
        name: "Activity",
        description: "Follows, comments, mentions, gifts, purchases and invites",
        importance: AndroidImportance.DEFAULT, // sound, no heads-up: activity is less urgent than a chat
        sound: "ako_activity.wav",
        lightColor: BRAND_LIGHT,
        lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
        showBadge: true,
      }),
      // Fallback for any push that arrives without a channel (older builds, FCM defaults).
      Notifications.setNotificationChannelAsync(CHANNEL_DEFAULT, {
        name: "General",
        importance: AndroidImportance.DEFAULT,
        lightColor: BRAND_LIGHT,
        lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
      }),
    ]);
  })().catch((e) => {
    ensured = null; // allow a retry
    if (__DEV__) console.warn("[push] couldn't create notification channels", e);
  });
  return ensured;
}
