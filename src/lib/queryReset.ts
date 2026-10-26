// src/lib/queryReset.ts
// Wipe cached data on an account change WITHOUT orphaning live observers.
//
// queryClient.clear() removes every query from the cache — including ones that mounted components (AuthProvider's
// own-profile lookup, staleTime Infinity) are still subscribed to. Their observers keep pointing at the removed
// query, which never refetches, so `profile` went null and the Profile tab showed "We couldn't load your profile"
// until something remounted. resetQueries() puts every query back to its initial state and refetches the active
// ones, so observers stay attached and the new account's data loads.
import type { QueryClient } from "@tanstack/react-query";

export function resetCacheForAccountChange(queryClient: QueryClient): void {
  void queryClient.resetQueries();
}
