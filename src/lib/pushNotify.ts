// src/lib/pushNotify.ts
// Chat pushes are CLIENT-invoked (unlike activity pushes, which a DB trigger sends): after a message
// insert succeeds the sender's app asks send-message-push to notify the other participants. The function
// verifies the caller is the message's sender, so this can only ever announce a message you just sent.
//
// This used to be a single fire-and-forget call: if the phone had no signal for a moment, the session token
// was mid-refresh, or the app was backgrounded/killed right after sending, the request was lost and the
// recipient was never notified — they only saw the message once they opened the app. Requests now go through
// a small durable outbox: each message id is written to storage BEFORE the call, retried with backoff while
// the app is running, and re-sent on launch, on resume and when connectivity returns. Sending a message is
// never blocked or failed by any of this.
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

import { supabase } from "./supabase";

const OUTBOX_KEY = "ako-push-outbox-v1";
/** A delayed "new message" ping is still useful; one that's hours old is just noise. */
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 45_000, 120_000];

interface OutboxItem {
  id: string;
  at: number;
  attempts: number;
}

let inflight = new Set<string>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function readOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: OutboxItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(OUTBOX_KEY);
    else localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    /* storage is best-effort; the in-memory retry below still runs */
  }
}

function update(id: string, change: (item: OutboxItem) => OutboxItem | null): void {
  writeOutbox(
    readOutbox().flatMap((item) => {
      if (item.id !== id) return [item];
      const next = change(item);
      return next ? [next] : [];
    })
  );
}

/** true = delivered (or can never succeed → drop); false = worth retrying. */
async function send(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke("send-message-push", { body: { message_id: id } });
    if (!error) return true;
    const status = (error as { context?: { status?: number } }).context?.status;
    // 4xx other than an expired session (401) or rate limit (429) will not get better by retrying
    // (message gone, not the sender, bad request).
    if (typeof status === "number" && status >= 400 && status < 500 && status !== 401 && status !== 429) return true;
    if (__DEV__) console.warn("[push] send-message-push failed", status, error.message);
    return false;
  } catch (e) {
    if (__DEV__) console.warn("[push] send-message-push unreachable", e);
    return false;
  }
}

function scheduleRetry(): void {
  if (retryTimer) return;
  const items = readOutbox();
  if (items.length === 0) return;
  const attempts = Math.max(...items.map((i) => i.attempts));
  const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)] ?? RETRY_DELAYS_MS[0];
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushPushOutbox();
  }, delay);
}

/** Send everything still waiting. Safe to call any time, as often as you like. */
export async function flushPushOutbox(): Promise<void> {
  const now = Date.now();
  const fresh = readOutbox().filter((i) => now - i.at <= MAX_AGE_MS && i.attempts < MAX_ATTEMPTS);
  writeOutbox(fresh);

  await Promise.all(
    fresh
      .filter((i) => !inflight.has(i.id))
      .map(async (item) => {
        inflight.add(item.id);
        try {
          if (await send(item.id)) update(item.id, () => null);
          else update(item.id, (i) => ({ ...i, attempts: i.attempts + 1 }));
        } finally {
          inflight.delete(item.id);
        }
      })
  );
  scheduleRetry();
}

/** Call once at startup (signed-in layout): retries on resume and when the network comes back. */
export function startPushOutbox(): () => void {
  if (started) return () => {};
  started = true;
  void flushPushOutbox();
  const appSub = AppState.addEventListener("change", (s) => {
    if (s === "active") void flushPushOutbox();
  });
  let wasOnline = true;
  const netUnsub = NetInfo.addEventListener((state) => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    if (online && !wasOnline) void flushPushOutbox();
    wasOnline = online;
  });
  return () => {
    started = false;
    appSub.remove();
    netUnsub();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };
}

export function notifyMessagePush(messageId: string): void {
  const items = readOutbox();
  if (!items.some((i) => i.id === messageId)) writeOutbox([...items, { id: messageId, at: Date.now(), attempts: 0 }]);
  void flushPushOutbox();
}
