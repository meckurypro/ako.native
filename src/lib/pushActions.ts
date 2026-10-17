// src/lib/pushActions.ts
// The buttons under a chat notification, like WhatsApp: "Reply" (type into the notification itself) and
// "Mark as read". The server tags every chat push with categoryId "message" (send-message-push); this file
// registers that category on the device and runs the buttons.
//
// Buttons do NOT open the app (opensAppToForeground: false). When the app is open, the response listener in
// usePushNavigation handles them. When it is backgrounded or killed, Android runs the background task defined
// below (expo-notifications → expo-task-manager) which loads the JS bundle headlessly. That is why this module
// defines the task at import time, and why it is imported from notificationHandler (the root layout imports it
// early). Both paths can fire for one tap, so every action is idempotent: a reply is inserted with an id derived
// from the notification, so the second insert is a harmless duplicate-key.
import "./polyfills";

import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { CHANNEL_MESSAGES } from "./notificationChannels";
import { supabase } from "./supabase";

export const MESSAGE_CATEGORY = "message";
export const ACTION_REPLY = "reply";
export const ACTION_MARK_READ = "mark_read";
const TASK_NAME = "ako-push-actions";
const MAX_REPLY_LENGTH = 4000;

export function isMessageAction(actionIdentifier: string): boolean {
  return actionIdentifier === ACTION_REPLY || actionIdentifier === ACTION_MARK_READ;
}

let categoryReady: Promise<void> | null = null;

/** Idempotent. Categories are stored on the device, so a push that arrives while the app is dead still gets its buttons. */
export function registerMessageCategory(): Promise<void> {
  categoryReady ??= Notifications.setNotificationCategoryAsync(MESSAGE_CATEGORY, [
    {
      identifier: ACTION_REPLY,
      buttonTitle: "Reply",
      textInput: { submitButtonTitle: "Send", placeholder: "Reply" },
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_MARK_READ,
      buttonTitle: "Mark as read",
      options: { opensAppToForeground: false },
    },
  ])
    .then(() => undefined)
    .catch((e) => {
      categoryReady = null; // allow a retry
      if (__DEV__) console.warn("[push] couldn't register the message category", e);
    });
  return categoryReady;
}

/** The slice of a notification response these actions need (same shape from the listener and from the task). */
export interface ActionResponse {
  actionIdentifier: string;
  userText?: string;
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
}

/** A UUID derived from (notification, text): the same tap always produces the same message id. */
async function deterministicId(seed: string): Promise<string> {
  const h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, seed);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

async function sendReply(response: ActionResponse, conversationId: string): Promise<void> {
  const text = (response.userText ?? "").trim().slice(0, MAX_REPLY_LENGTH);
  if (!text) return;
  const userId = await currentUserId();
  const id = await deterministicId(`${response.notification.request.identifier}:${conversationId}:${text}`);

  const { error } = await supabase.from("messages").insert({ id, conversation_id: conversationId, sender_id: userId, content: text });
  if (error?.code === "23505") return; // the other path already sent this one
  if (error) throw error;

  // Replying means you've read the thread, and accepts a pending message request (as useSendMessage does).
  const now = new Date().toISOString();
  await Promise.allSettled([
    supabase.from("conversation_participants").update({ last_read_at: now }).eq("conversation_id", conversationId).eq("user_id", userId),
    supabase.from("conversation_participants").update({ is_request: false, archived_at: null }).eq("conversation_id", conversationId).eq("user_id", userId).eq("is_request", true),
    supabase.from("messages").update({ read_at: now }).eq("conversation_id", conversationId).neq("sender_id", userId).is("read_at", null),
  ]);
  // The database trigger pushes this message to the other person; this is the same belt-and-braces call the app makes.
  void supabase.functions.invoke("send-message-push", { body: { message_id: id } }).catch(() => {});
}

async function markRead(conversationId: string): Promise<void> {
  const userId = await currentUserId();
  const now = new Date().toISOString();
  const [a, b] = await Promise.all([
    supabase.from("conversation_participants").update({ last_read_at: now }).eq("conversation_id", conversationId).eq("user_id", userId),
    supabase.from("messages").update({ read_at: now }).eq("conversation_id", conversationId).neq("sender_id", userId).is("read_at", null),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
}

async function tellReplyFailed(conversationId: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: "Reply not sent", body: "Open Akọ to send it.", data: { type: "message", conversationId } },
    trigger: Platform.OS === "android" ? { channelId: CHANNEL_MESSAGES } : null,
  }).catch(() => {});
}

/** Runs a Reply / Mark as read button. Never throws. */
export async function handleMessageAction(response: ActionResponse): Promise<void> {
  const conversationId = response.notification.request.content.data?.conversationId;
  if (typeof conversationId !== "string") return;
  try {
    if (response.actionIdentifier === ACTION_REPLY) await sendReply(response, conversationId);
    else if (response.actionIdentifier === ACTION_MARK_READ) await markRead(conversationId);
    else return;
    // Done: take the notification out of the tray (like WhatsApp does after a reply).
    await Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => {});
  } catch (e) {
    if (__DEV__) console.warn("[push] notification action failed", e);
    if (response.actionIdentifier === ACTION_REPLY) await tellReplyFailed(conversationId);
  }
}

// Background / killed: Android runs this task for a button tap. It must be defined at module scope.
TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK_NAME, async ({ data, error }) => {
  if (error || !data || typeof data !== "object") return;
  const candidate = data as unknown as Partial<ActionResponse>;
  if (typeof candidate.actionIdentifier !== "string" || !isMessageAction(candidate.actionIdentifier) || !candidate.notification) return;
  await handleMessageAction(candidate as ActionResponse);
});

if (Platform.OS === "android") {
  // iOS runs the buttons through the response listener (the app is woken for them); the task is Android-only here.
  Notifications.registerTaskAsync(TASK_NAME).catch((e) => {
    if (__DEV__) console.warn("[push] couldn't register the notification task", e);
  });
}
