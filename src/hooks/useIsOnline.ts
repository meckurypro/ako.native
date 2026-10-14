// src/hooks/useIsOnline.ts
// Live connectivity, read from React Query's onlineManager (which src/lib/queryClient.ts feeds from NetInfo), so
// every part of the app agrees on what "offline" means.
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    () => true
  );
}
