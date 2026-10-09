// src/hooks/usePushLifecycle.ts
// Everything push-related that must run while a user is signed in; mounted once in the (app) layout.
//   • registration   – mint the Expo token and attach it to the account (only once the OS permission is granted)
//   • tap routing    – open the right screen when a notification is tapped (background, killed, or tray)
//   • live refresh   – a push that arrives in the foreground refreshes the matching lists
//   • badge sync     – app-icon badge = unread notifications + unread conversations
import { useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { notificationAction, parsePushData, type PushTapData } from "../lib/notificationRoute";
import { getExpoPushToken, registerPushToken } from "../lib/push";
import { refreshPushPermission, usePushPermission } from "../lib/pushPermissionStore";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useUnreadConversationCount } from "./useMessaging";
import { enrichNotifications, useUnreadCount, type NotificationWithActor } from "./useNotifications";

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
        if (!token || cancelled) return;
        const key = `${user.id}:${token}`;
        const last = lastRegistered.get(key);
        if (last && Date.now() - last < REREGISTER_AFTER_MS) return;
        await registerPushToken(token);
        lastRegistered.set(key, Date.now());
      } catch (e) {
        if (__DEV__) console.warn("[push] token registration failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, status]);
}

async function openFromPush(data: NonNullable<PushTapData>): Promise<void> {
  if (data.type === "message") {
    router.push(`/messages/${data.conversationId}` as Href);
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
    router.push("/notifications" as Href);
    return;
  }

  // Opening it counts as reading it.
  if (!(row as NotificationWithActor).read_at) {
    void supabase.from(table).update({ read_at: new Date().toISOString() }).eq("id", data.notificationId);
  }

  const [notification] = await enrichNotifications([row as unknown as NotificationWithActor]);
  const action = notificationAction(notification);
  if (action.kind === "route") router.push(action.href as Href);
  // Invites/credits are answered in a dialog owned by the Notifications screen.
  else if (action.kind === "none") router.push("/notifications" as Href);
  else router.push({ pathname: "/notifications", params: { open: notification.id } } as Href);
}

export function usePushNavigation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const response = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handledId.current === id) return;
    handledId.current = id;
    Notifications.clearLastNotificationResponse();

    const data = parsePushData(response.notification.request.content.data);
    if (!data) return;
    // Let the navigator finish mounting on a cold start before pushing a route.
    const timer = setTimeout(() => {
      openFromPush(data)
        .catch(() => router.push("/notifications" as Href))
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["page-notifications"] });
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [response, user?.id, queryClient]);
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
  const unreadNotifications = useUnreadCount();
  const unreadConversations = useUnreadConversationCount();
  const total = unreadNotifications + unreadConversations;

  useEffect(() => {
    if (status !== "granted") return;
    Notifications.setBadgeCountAsync(total).catch(() => {});
  }, [status, total]);
}

export function usePushLifecycle() {
  usePushRegistration();
  usePushNavigation();
  useForegroundPushRefresh();
  useBadgeSync();
}
