// src/lib/pushStatusStore.ts
// A tiny observable record of how push setup went on THIS device: did we get a token, did the backend accept
// it, and if not, why. Errors used to be console.warn'd in __DEV__ only, so on a preview/release APK every
// failure was invisible. Settings → Notifications reads this.
import { useSyncExternalStore } from "react";

export interface PushStatus {
  /** Token minted on this device (shown truncated — never the full value). */
  tokenPreview: string | null;
  registered: boolean;
  /** Last failure, in plain words. null while healthy. */
  error: string | null;
  checkedAt: number | null;
}

let state: PushStatus = { tokenPreview: null, registered: false, error: null, checkedAt: null };
const listeners = new Set<() => void>();

export function setPushStatus(patch: Partial<PushStatus>): void {
  state = { ...state, ...patch, checkedAt: Date.now() };
  listeners.forEach((l) => l());
}

export function describePushError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/FirebaseApp|google-services|FCM|Firebase/i.test(msg)) return "This build has no Firebase config (google-services.json). Rebuild the APK.";
  if (/projectId/i.test(msg)) return "No EAS project id in the app config.";
  if (/network|fetch|timeout/i.test(msg)) return "Couldn't reach the push service. Check the connection.";
  return msg.slice(0, 160);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => state;

export function usePushStatus(): PushStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
