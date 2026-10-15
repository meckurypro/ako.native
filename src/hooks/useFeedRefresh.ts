// src/hooks/useFeedRefresh.ts
// onRefresh for one paged feed tab (For You / Top / Following). See refreshFeedPages in lib/refresh.ts for why a bare
// refetch / setPage(0) isn't enough once the user has scrolled into later pages.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { refreshFeedPages } from "@/lib/refresh";

interface FeedRefreshArgs {
  /** This tab's feed key prefix without the page — feedKeys.* / pageFeedKeys.*. */
  prefix: readonly unknown[];
  page: number;
  setPage: (page: number) => void;
  refetch: () => Promise<unknown> | unknown;
  /** Other queries that must refresh with the feed (e.g. a post pinned to the top). */
  extra?: Array<() => Promise<unknown> | unknown>;
}

export function useFeedRefresh(args: FeedRefreshArgs) {
  const queryClient = useQueryClient();
  // Latest values through a ref: the callback stays stable, so PostList's refresh control isn't rebuilt every render.
  const argsRef = useRef(args);
  argsRef.current = args;

  return useCallback(() => refreshFeedPages({ queryClient, ...argsRef.current }), [queryClient]);
}
