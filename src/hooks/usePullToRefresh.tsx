// Shared pull-to-refresh: drag the page down, every passed refetch runs AND every other query currently on screen
// is refetched too (cards, FAQs, purchase/saved state, counts…), spinner clears when all settle — or after a cap.
// Feed / HashtagFeed / Notifications keep their own refresh; everything else uses this.
import NetInfo from "@react-native-community/netinfo";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

type Refetch = () => Promise<unknown> | unknown;

/** A refresh must never hang the spinner (a refetch that pauses on a flaky connection never settles). */
const REFRESH_CAP_MS = 12_000;

export function usePullToRefresh(refetch: Refetch | Refetch[], offset = 0) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Read through a ref so the control's identity doesn't change when callers pass a fresh array each render.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    const list = Array.isArray(refetchRef.current) ? refetchRef.current : [refetchRef.current];
    setRefreshing(true);
    let cap: ReturnType<typeof setTimeout> | undefined;
    try {
      // Re-probe connectivity on every pull. React Query pauses (and never settles) refetches while it believes it is
      // offline, so a stale "offline" flag made the spinner show with nothing happening. A pull resets it to the truth.
      const net = await NetInfo.fetch();
      const online = !!net.isConnected && net.isInternetReachable !== false;
      onlineManager.setOnline(online);
      if (!online) return; // genuinely offline: the cached data stays, and queries resync on reconnect

      // The callers only list their screen's main queries; the rest of what's visible (project card state, FAQs,
      // reviews, counts…) lives in other active queries, so without this the spinner ran but the UI never changed.
      // Skipped while offline-first writes (likes, saves) are still queued, so a refetch can't overwrite an
      // optimistic value the server hasn't received yet.
      const hasQueuedWrites = queryClient.getMutationCache().getAll().some((m) => m.state.isPaused || m.state.status === "pending");
      const all: Promise<unknown>[] = list.map((fn) => Promise.resolve().then(fn));
      if (!hasQueuedWrites) all.push(queryClient.refetchQueries({ type: "active" }));

      // allSettled: one failing query must never leave the spinner stuck; the cap covers one that never settles.
      await Promise.race([Promise.allSettled(all), new Promise((resolve) => (cap = setTimeout(resolve, REFRESH_CAP_MS)))]);
    } finally {
      if (cap) clearTimeout(cap);
      if (mounted.current) setRefreshing(false);
    }
  }, [queryClient]);

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} progressViewOffset={offset} />,
    [refreshing, onRefresh, colors.accent, offset]
  );

  return { refreshing, onRefresh, refreshControl };
}
