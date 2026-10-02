// File: src/lib/queryClient.ts
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
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

export { onlineManager };
