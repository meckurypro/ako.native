// src/hooks/usePageLoading.ts
// True while the page the user just opened is still waiting on its first data.
//
// "First data" = a query that has never returned anything (state.data === undefined) and is fetching right now,
// started within a short window after the route changed (or chained from one already tracked, e.g. a details
// query that only starts once its project query lands). Background refetches of already-loaded data, queries opened
// later by sheets/menus, and paused (offline) queries never count. It turns false the instant the last tracked query
// settles — success or error — and is capped so a hung request can never leave the overlay up.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Queries that start fetching this soon after navigation belong to the page being opened. */
const ROUTE_WINDOW_MS = 1000;
/** Never keep the overlay up longer than this for one query. */
const MAX_TRACK_MS = 12000;
/** Skip the overlay for loads that finish almost instantly, so fast pages don't flash it. */
const SHOW_DELAY_MS = 120;

export function usePageLoading(routeKey: string): boolean {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const navAt = useRef(Date.now());
  const tracked = useRef(new Map<string, number>());

  useEffect(() => {
    const cache = queryClient.getQueryCache();

    function scan() {
      const now = Date.now();
      for (const q of cache.findAll({ fetchStatus: "fetching" })) {
        if (q.state.data !== undefined || tracked.current.has(q.queryHash)) continue;
        if (tracked.current.size > 0 || now - navAt.current < ROUTE_WINDOW_MS) tracked.current.set(q.queryHash, now);
      }
      for (const [hash, startedAt] of tracked.current) {
        const q = cache.get(hash);
        const stillLoading = !!q && q.state.data === undefined && q.state.fetchStatus === "fetching";
        if (!stillLoading || now - startedAt > MAX_TRACK_MS) tracked.current.delete(hash);
      }
      setPending(tracked.current.size > 0);
    }

    navAt.current = Date.now();
    tracked.current.clear();
    scan();
    const unsubscribe = cache.subscribe(scan);
    return unsubscribe;
  }, [queryClient, routeKey]);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  return visible && pending;
}
