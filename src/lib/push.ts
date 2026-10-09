// src/lib/push.ts
// Device-side push plumbing: OS permission, the Expo push token, and (un)registering it with the backend.
//
// Backend contract (read from the live project, not guessed):
//   • RPC  register_push_token(p_token text, p_platform 'ios' | 'android')  — upserts on token, so a token that
//     moves to another signed-in user is re-assigned to them
//   • RLS  users may DELETE their own public.push_tokens rows → used on sign-out
//   • send-activity-push / send-message-push deliver through Expo's push API
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabase";

export type PushPermissionStatus = "granted" | "denied" | "undetermined";

export interface PushPermission {
  status: PushPermissionStatus;
  /** false once the OS will no longer show its prompt (iOS after one denial) — only system Settings can change it. */
  canAskAgain: boolean;
}

const TOKEN_KEY = "ako-push-token";

function toPermission(p: Notifications.NotificationPermissionsStatus): PushPermission {
  const status: PushPermissionStatus = p.granted ? "granted" : p.status === Notifications.PermissionStatus.DENIED ? "denied" : "undetermined";
  return { status, canAskAgain: p.canAskAgain };
}

export async function readPushPermission(): Promise<PushPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

export async function requestPushPermission(): Promise<PushPermission> {
  return toPermission(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } }));
}

/** The EAS project id Expo needs to mint a push token. Set by `eas init` (app.json → extra.eas.projectId). */
export function getEasProjectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? undefined;
}

/** null when a token can't be minted here (simulator, no EAS project yet, or no FCM/APNs credentials). */
export async function getExpoPushToken(): Promise<string | null> {
  // Remote pushes need a real device; simulators have no APNs token.
  if (!Device.isDevice) return null;
  const projectId = getEasProjectId();
  if (!projectId) {
    if (__DEV__) console.warn("[push] no EAS projectId in app config — run `eas init`; push is disabled until then.");
    return null;
  }
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

export async function registerPushToken(token: string): Promise<void> {
  const { error } = await supabase.rpc("register_push_token", { p_token: token, p_platform: Platform.OS === "ios" ? "ios" : "android" });
  if (error) throw error;
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Detach this device from the signed-in account. MUST run before supabase.auth.signOut(), while the session
 * can still satisfy RLS — otherwise the next person to use the phone would keep receiving the previous
 * account's pushes. Best-effort and time-boxed so an offline sign-out is never blocked.
 */
export async function unregisterPushToken(timeoutMs = 3000): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY);
  const work = (async () => {
    if (token) {
      const { error } = await supabase.from("push_tokens").delete().eq("token", token);
      if (!error) localStorage.removeItem(TOKEN_KEY);
    }
  })().catch(() => {});
  await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
  // Whatever the network did, clear this device's tray and badge — it belongs to the account that's leaving.
  await Promise.allSettled([Notifications.setBadgeCountAsync(0), Notifications.dismissAllNotificationsAsync()]);
}

/** Remove delivered notifications whose payload matches — keeps the tray honest once their content has been seen. */
export async function dismissPresentedWhere(predicate: (data: Record<string, unknown>) => boolean): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((n) => predicate((n.request.content.data ?? {}) as Record<string, unknown>))
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier))
    );
  } catch {
    /* tray bookkeeping is cosmetic */
  }
}
