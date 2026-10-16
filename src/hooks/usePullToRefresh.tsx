// Shared pull-to-refresh: drag the page down, every passed refetch runs — and, unless a list opts out, every other
// query currently on screen is refetched too (cards, FAQs, purchase/saved state, counts…). The spinner clears when
// all settle, or after a cap. The logic itself lives in lib/refresh.ts (pure, unit-tested); this is the React wrapper.
//
// `refreshing` stays true for the whole reload (min. MIN_CLEAR_MS): screens use it to clear their content while it runs,
// so the page visibly empties and then repopulates with fresh data.
//
// Used by every pull-to-refresh screen, including PostList (the Feed, hashtag feeds…) and Notifications.
import NetInfo from "@react-native-community/netinfo";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl } from "react-native";

import { runRefresh, type NetProbeResult } from "@/lib/refresh";
import { useTheme } from "@/theme/ThemeProvider";

/** Even a fast refetch keeps the page cleared this long, so the reload is visible rather than a flicker. */
const MIN_CLEAR_MS = 700;

type Refetch = () => Promise<unknown> | unknown;

export interface PullToRefreshOptions {
  /**
   * Also refetch every other active query (default true). Lists that are self-contained — a post feed, whose rows
   * carry their own counts — pass false so one pull is one request, not one per mounted tab or card.
   */
  refetchActive?: boolean;
}

// `refresh()` forces a fresh reachability probe; `fetch()` can answer from stale state. Fall back if it throws.
const probeNetwork = (): Promise<NetProbeResult | null> => NetInfo.refresh().catch(() => NetInfo.fetch());

export function usePullToRefresh(refetch: Refetch | Refetch[], offset = 0, options: PullToRefreshOptions = {}) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Read through refs so the control's identity doesn't change when callers pass fresh arrays/closures each render.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const refetchActiveRef = useRef(options.refetchActive ?? true);
  refetchActiveRef.current = options.refetchActive ?? true;

  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    if (inFlight.current) return; // a second pull while one is running would just cancel and restart the fetches
    inFlight.current = true;
    setRefreshing(true);
    const startedAt = Date.now();
    try {
      const list = Array.isArray(refetchRef.current) ? refetchRef.current : [refetchRef.current];
      await runRefresh(list, { refetchActive: refetchActiveRef.current }, { queryClient, setOnline: (online) => onlineManager.setOnline(online), probe: probeNetwork });
    } finally {
      const wait = MIN_CLEAR_MS - (Date.now() - startedAt);
      if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [queryClient]);

  const refreshControl = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} progressViewOffset={offset} />,
    [refreshing, onRefresh, colors.accent, offset]
  );

  return { refreshing, onRefresh, refreshControl };
}
