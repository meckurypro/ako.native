// src/hooks/useBalanceVisibility.ts
//
// The eye on the Wallet's balance card. The choice sticks until the person changes it again: it's kept on the
// device (AsyncStorage), per account, so switching accounts doesn't carry one person's "hidden" onto another.
// Same behaviour as the web app.
//
// Until the saved choice has been read from disk (a few milliseconds) the balance is shown MASKED, never revealed:
// someone who chose to hide it must not see it flash up on open.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAuth } from "./useAuth";

const KEY_PREFIX = "ako:wallet:balance-hidden";
const cache = new Map<string, boolean>(); // key -> hidden (absent = not read yet)
const loading = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function ensureLoaded(key: string) {
  if (cache.has(key) || loading.has(key)) return;
  loading.add(key);
  AsyncStorage.getItem(key)
    .then((value) => cache.set(key, value === "1"))
    .catch(() => cache.set(key, false))
    .finally(() => {
      loading.delete(key);
      notify();
    });
}

export function useBalanceVisibility() {
  const { user } = useAuth();
  const key = `${KEY_PREFIX}:${user?.id ?? "anon"}`;

  useEffect(() => ensureLoaded(key), [key]);

  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const stored = useSyncExternalStore(subscribe, () => cache.get(key));

  const hidden = stored ?? true;

  const setHidden = useCallback(
    (next: boolean) => {
      cache.set(key, next);
      notify();
      AsyncStorage.setItem(key, next ? "1" : "0").catch(() => undefined); // still applies for this session
    },
    [key],
  );

  const toggle = useCallback(() => setHidden(!(cache.get(key) ?? true)), [key, setHidden]);

  return { hidden, toggle, setHidden };
}
