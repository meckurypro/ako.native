// src/lib/notificationHandler.ts
// Side-effect module (imported once from the root layout): decides how a push that arrives WHILE the app
// is open is presented, and creates the Android channels and the chat-button category at startup.
import * as Notifications from "expo-notifications";

import { ensureNotificationChannels } from "./notificationChannels";
import { parsePushData } from "./notificationRoute";
import "./pushLaunch"; // reads "opened by a notification?" before anything can clear it
import { registerMessageCategory } from "./pushActions";
import { getActiveConversation } from "./pushState";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = parsePushData(notification.request.content.data);
    // Already reading this chat: the message appears in the thread itself — don't also banner/ping it.
    const suppress = data?.type === "message" && data.conversationId === getActiveConversation();
    return {
      shouldShowBanner: !suppress,
      shouldShowList: !suppress,
      shouldPlaySound: !suppress,
      // The badge is computed from real unread counts (useBadgeSync), not incremented per push.
      shouldSetBadge: false,
    };
  },
});

void ensureNotificationChannels();
void registerMessageCategory();
