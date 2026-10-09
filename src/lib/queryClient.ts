// File: src/lib/queryClient.ts
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";
import { AppState, Platform } from "react-native";

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
