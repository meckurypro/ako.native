// src/lib/pushPermissionStore.ts
// One shared, observable copy of the OS notification permission, so the Notifications screen, Settings and
// the registration effect all see the same value the moment the user answers the prompt.
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { ensureNotificationChannels } from "./notificationChannels";
import { readPushPermission, requestPushPermission, type PushPermission } from "./push";

interface State extends PushPermission {
  loaded: boolean;
}

let state: State = { status: "undetermined", canAskAgain: true, loaded: false };
const listeners = new Set<() => void>();

function setState(next: State): void {
  state = next;
  listeners.forEach((l) => l());
}

export async function refreshPushPermission(): Promise<void> {
  try {
    setState({ ...(await readPushPermission()), loaded: true });
  } catch {
    /* leave the last known value */
  }
}

/** Shows the OS prompt (only possible while canAskAgain). Always call from a user gesture, never at launch. */
export async function askForPushPermission(): Promise<PushPermission> {
  await ensureNotificationChannels(); // Android 13+ shows no prompt until a channel exists
  const result = await requestPushPermission();
  setState({ ...result, loaded: true });
  return result;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => state;

export function usePushPermission() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (!state.loaded) void refreshPushPermission();
  }, []);
  const request = useCallback(() => askForPushPermission(), []);
  return { ...snapshot, request, refresh: refreshPushPermission };
}
