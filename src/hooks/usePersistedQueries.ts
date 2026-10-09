// src/hooks/usePersistedQueries.ts
// Restores the persisted cache for the signed-in user before the app shell renders (so lists open with
// data, not spinners), then keeps saving changes. Returns true once it's safe to render.
import { useQueryClient } from "@tanstack/react-query";
import { persistQueryClientRestore, persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { createSqlitePersister, shouldPersistQuery } from "../lib/queryPersister";
import { resumeSecureCache } from "../lib/secureDb";
import { useAuth } from "./useAuth";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Bump to discard every device's cache when a persisted query's shape changes. */
const CACHE_VERSION = "1";
const BUSTER = `${Constants.expoConfig?.version ?? "0"}-${CACHE_VERSION}`;
/** Never hold the UI hostage to a slow disk. */
const RESTORE_TIMEOUT_MS = 1500;

export function usePersistedQueries(): boolean {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [readyFor, setReadyFor] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    resumeSecureCache(); // a previous sign-out paused writes
    const persister = createSqlitePersister(user.id);
    let cancelled = false;
    let unsubscribe: () => void = () => {};

    (async () => {
      try {
        await persistQueryClientRestore({ queryClient, persister, maxAge: MAX_AGE_MS, buster: BUSTER });
      } catch {
        /* a bad cache is just a cold start */
      }
      if (cancelled) return;
      unsubscribe = persistQueryClientSubscribe({ queryClient, persister, buster: BUSTER, dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery } });
      setReadyFor(user.id);
    })();
    const timeout = setTimeout(() => setReadyFor((cur) => cur ?? user.id), RESTORE_TIMEOUT_MS);

    // The OS can kill a backgrounded app without warning: write the latest snapshot as it leaves the foreground.
    const appState = AppState.addEventListener("change", (s) => {
      if (s !== "active") void persister.flush();
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      appState.remove();
      unsubscribe();
      // Not flush(): this runs on sign-out / account switch, and a late write would resurrect wiped data.
      persister.dispose();
    };
  }, [user?.id, queryClient]);

  return !!user && readyFor === user.id;
}
