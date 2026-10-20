// src/hooks/usePushLifecycle.ts
// Everything push-related that must run while a user is signed in; mounted once in the (app) layout.
//   • (the upfront permission ask runs right after sign-in, from the app root — see hooks/useLaunchPushAsk)
//   • registration   – mint the Expo token and attach it to the account (only once the OS permission is granted)
//   • tap routing    – open the right screen when a notification is tapped (background, killed, or tray);
//                      also runs the Reply / Mark as read buttons when the app is open (see lib/pushActions)
//   • live refresh   – a push that arrives in the foreground refreshes the matching lists
//   • badge sync     – app-icon badge = unread notifications + unread conversations
import { useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { fallbackRouteForType, INBOX_ROUTE, notificationAction, parsePushData, type PushTapData } from "../lib/notificationRoute";
import { handleMessageAction, isMessageAction, type ActionResponse } from "../lib/pushActions";
import { markPushTap } from "../lib/pushLaunch";
import { getExpoPushToken, registerPushToken } from "../lib/push";
import { startPushOutbox } from "../lib/pushNotify";
import { refreshPushPermission, usePushPermission } from "../lib/pushPermissionStore";
import { describePushError, setPushStatus } from "../lib/pushStatusStore";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useConversations } from "./useMessaging";
import { enrichNotifications, useNotifications, type NotificationWithActor } from "./useNotifications";

/** Re-register at most this often per (user, token): enough to keep push_tokens.last_seen_at fresh, without an RPC on every resume. */
const REREGISTER_AFTER_MS = 6 * 60 * 60 * 1000;
const lastRegistered = new Map<string, number>();

export function usePushRegistration() {
  const { user } = useAuth();
  const { status } = usePushPermission();

  // The user can flip the permission in system Settings and come back — pick that up on resume.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refreshPushPermission();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!user || status !== "granted") return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getExpoPushToken();
        if (!token) {
          if (!cancelled) setPushStatus({ tokenPreview: null, registered: false, error: "No push token on this device (emulators can't receive pushes)." });
          return;
        }
        if (cancelled) return;
        const key = `${user.id}:${token}`;
        const last = lastRegistered.get(key);
        if (last && Date.now() - last < REREGISTER_AFTER_MS) return;
        await registerPushToken(token);
        lastRegistered.set(key, Date.now());
        if (!cancelled) setPushStatus({ tokenPreview: `${token.slice(0, 22)}…`, registered: true, error: null });
      } catch (e) {
        // On a release/preview APK nobody sees the console — surface it in Settings → Notifications.
        if (!cancelled) setPushStatus({ registered: false, error: describePushError(e) });
        if (__DEV__) console.warn("[push] token registration failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, status]);
}

async function openFromPush(data: PushTapData): Promise<void> {
  // A chat message leads to the inbox (the Page inbox when acting as a Page — /inbox decides).
  if (data?.type === "message") {
    router.navigate(INBOX_ROUTE as Href);
    return;
  }
  // No usable payload (a push sent without our data): the notifications list is the most relevant place.
  if (!data) {
    router.navigate("/notifications" as Href);
    return;
  }

  // Activity pushes carry only an id (nothing sensitive in the OS tray), so look the row up now.
  const table = data.source === "page" ? "page_notifications" : "notifications";
  const fk = data.source === "page" ? "page_notifications_actor_id_fkey" : "notifications_actor_id_fkey";
  const { data: row } = await supabase
    .from(table)
    .select(`*, actor:profiles!${fk}(username, display_name, avatar_url)`)
    .eq("id", data.notificationId)
    .maybeSingle();
  if (!row) {
    router.navigate(fallbackRouteForType(data.notificationType) as Href);
    return;
  }

  // Opening it counts as reading it.
  if (!(row as NotificationWithActor).read_at) {
    void supabase.from(table).update({ read_at: new Date().toISOString() }).eq("id", data.notificationId);
  }

  const [notification] = await enrichNotifications([row as unknown as NotificationWithActor]);
  const action = notificationAction(notification);
  if (action.kind === "route") router.navigate(action.href as Href);
  // Invites/credits are answered in a dialog owned by the Notifications screen.
  else if (action.kind === "none") router.navigate(fallbackRouteForType(data.notificationType) as Href);
  else router.navigate({ pathname: "/notifications", params: { open: notification.id } } as Href);
}

export function usePushNavigation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Notification ids already acted on, so the launch response and the live listener never both open it.
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!user) return;

    const handle = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;

      // Reply / Mark as read, tapped while the app is open (background and killed are handled by the task).
      if (isMessageAction(response.actionIdentifier)) {
        if (handled.current.has(`${id}:${response.actionIdentifier}`)) return;
        handled.current.add(`${id}:${response.actionIdentifier}`);
        void handleMessageAction(response as unknown as ActionResponse).finally(() => {
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
          void queryClient.invalidateQueries({ queryKey: ["messages"], exact: false });
        });
        return;
      }

      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      if (handled.current.has(id)) return;
      handled.current.add(id);
      // Tell route memory this launch belongs to the notification, so it never restores an old screen on top.
      markPushTap();

      const data = parsePushData(response.notification.request.content.data);
      // The navigator may still be settling on a cold start; navigating after the current task is enough.
      // (This is deliberately NOT cancelled by effect cleanup: clearing the response below re-renders
      // listeners, and a cancelled timer here used to drop the navigation entirely.)
      setTimeout(() => {
        openFromPush(data)
          .catch(() => router.navigate((data?.type === "message" ? INBOX_ROUTE : "/notifications") as Href))
          .finally(() => {
            Notifications.clearLastNotificationResponse();
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
            void queryClient.invalidateQueries({ queryKey: ["page-notifications"] });
          });
      }, 0);
    };

    // Launch tap (killed app) first, then every tap while the app lives.
    handle(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [user?.id, queryClient]);
}

export function useForegroundPushRefresh() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = parsePushData(notification.request.content.data);
      if (data?.type === "message") {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["messages", data.conversationId], exact: false });
      } else if (data?.type === "activity") {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        void queryClient.invalidateQueries({ queryKey: ["page-notifications"] });
      }
    });
    return () => sub.remove();
  }, [queryClient]);
}

export function useBadgeSync() {
  const { status } = usePushPermission();
  const notifications = useNotifications();
  const conversations = useConversations();

  // Don't touch the badge until BOTH lists have actually been fetched this session. The counts are 0 while
  // loading (and the persisted cache can be stale), and on Android setBadgeCountAsync(0) clears the whole
  // notification tray — so syncing early would wipe pending notifications the user hasn't seen.
  const ready = notifications.isFetchedAfterMount && conversations.isFetchedAfterMount && notifications.isSuccess && conversations.isSuccess;
  const total = (notifications.data?.filter((n) => !n.read_at).length ?? 0) + (conversations.data?.filter((c) => c.unread).length ?? 0);

  useEffect(() => {
    if (status !== "granted" || !ready) return;
    Notifications.setBadgeCountAsync(total).catch(() => {});
  }, [status, ready, total]);
}

/** Re-sends chat pushes that didn't get out (no signal, app closed right after sending). */
export function usePushOutbox() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    return startPushOutbox();
  }, [user?.id]);
}

export function usePushLifecycle() {
  usePushOutbox();
  usePushRegistration();
  usePushNavigation();
  useForegroundPushRefresh();
  useBadgeSync();
}
