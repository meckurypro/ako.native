// File: src/lib/queryClient.ts
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { AppState, Platform } from "react-native";

import { registerOfflineMutations } from "./offlineMutations";
import { prefetchImagesFromData, scheduleImageStorePrune } from "./imageStore";
import { PERSISTED_GC_MS, PERSISTED_QUERY_ROOTS, shouldPersistQuery } from "./queryPersister";

// Same defaults as the web app (App.tsx): one retry, and no refetch on focus
// by default. On native, "focus" means the app returning to the foreground —
// individual queries can opt back in with refetchOnWindowFocus.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Reaction / comment-reaction / bookmark mutations are defined as defaults (mutationFn + onSuccess), so a mutation
// restored from SQLite after an app kill can run with no component mounted. Must happen before cache restore.
registerOfflineMutations(queryClient);

// Persisted queries must outlive React Query's default 5-minute gc. Otherwise a list left unobserved for 5 minutes is
// evicted from memory and therefore missing from the NEXT snapshot — so a cold offline start found nothing to show.
for (const root of PERSISTED_QUERY_ROOTS) queryClient.setQueryDefaults([root], { gcTime: PERSISTED_GC_MS });

// Whatever list we persist for offline is useless without its pictures: when one loads, store its avatars / thumbnails /
// post images on the device now (a few at a time, never over a dead connection) instead of waiting for the user to scroll.
if (Platform.OS !== "web") {
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "success" && shouldPersistQuery(event.query)) prefetchImagesFromData(event.query.state.data);
  });
  scheduleImageStorePrune();
}

// Wire React Query's focus manager to the app lifecycle (RN has no window focus).
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (status) => {
    focusManager.setFocused(status === "active");
  });
}

// React Query assumes it's online unless told otherwise. Feed it real connectivity so that, offline, queries
// pause (and serve their cached data) instead of failing and retrying — and on reconnect they resume and
// refetch, which is what re-syncs the app with Supabase.
if (Platform.OS !== "web") {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // isInternetReachable is null until the first probe finishes; treat "unknown" as reachable.
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    })
  );
}

export { onlineManager };
