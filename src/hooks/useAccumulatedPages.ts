// src/hooks/useAccumulatedPages.ts
// The paged feed hooks return one page at a time (page 0, 1, 2…). This stitches them into one growing list and
// reports when a page came back empty so the list knows to stop asking for more.
//
// The list is DERIVED from the query cache on every render — it is not copied into component state through an
// effect. A copy lags the cache by a commit, and everything that patches counts does so in the cache: a like's
// confirmation flips the "my reaction" query and bumps the post row's like_count in ONE notification batch, but a
// copied row picked the new count up a commit later, so the number visibly dipped back and then recovered
// (n+1 → n → n+1). Pages before the current one were worse: their copies never saw the cache change at all, so once
// the optimistic overlay cleared they showed a stale count until a refetch. Reading the cache directly fixes both,
// and is why the profile grid (which renders its query's data as-is) never had the problem.
//
// Subscribing goes through notifyManager.batchCalls — the same scheduling React Query uses for useQuery — so the
// list re-renders in the same flush as the cards' own observers (like state + count land in one commit).
// We deliberately do NOT mount extra observers for the earlier pages: observers on the same key share (and overwrite)
// the query's options, and a queryFn-less observer would fight the screen's real one.
//
// Pages already seen are retained as a fallback, so a page the cache garbage-collects never vanishes from a list the
// user is scrolling. Repeated ids (offset paging overlaps when the ranking shifts) are dropped by mergePages.
import { notifyManager, partialMatchKey, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { mergePages } from "@/lib/refresh";

export function useAccumulatedPages<T extends { id: string }>(
  pageData: T[] | undefined,
  page: number,
  /** The feed's query-key prefix WITHOUT the page — feedKeys.* / pageFeedKeys.*. The full key is [...prefix, pageIndex]. */
  prefix: QueryKey
) {
  const queryClient = useQueryClient();
  // The prefix is a fresh array every render; its serialised form is its identity.
  const prefixId = JSON.stringify(prefix);
  const prefixRef = useRef(prefix);
  prefixRef.current = prefix;

  const snapshot = useRef<(T[] | undefined)[]>([]);
  const retained = useRef<{ prefixId: string; pages: Record<number, T[]> }>({ prefixId, pages: {} });

  const subscribe = useCallback(
    (onChange: () => void) => {
      const watched = JSON.parse(prefixId) as QueryKey;
      return queryClient.getQueryCache().subscribe(
        notifyManager.batchCalls((event) => {
          if (event.type === "updated" || event.type === "added" || event.type === "removed") {
            if (partialMatchKey(event.query.queryKey, watched)) onChange();
          }
        })
      );
    },
    [queryClient, prefixId]
  );

  const getSnapshot = useCallback(() => {
    const next = Array.from({ length: page + 1 }, (_, index) => queryClient.getQueryData<T[]>([...prefixRef.current, index]));
    const prev = snapshot.current;
    // Same page arrays → same snapshot, so React skips the render (required by useSyncExternalStore).
    if (prev.length === next.length && prev.every((data, index) => data === next[index])) return prev;
    snapshot.current = next;
    return next;
  }, [queryClient, page]);

  const pages = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const posts = useMemo(() => {
    if (retained.current.prefixId !== prefixId) retained.current = { prefixId, pages: {} };
    const kept = retained.current.pages;
    const byIndex: Record<number, T[]> = {};
    pages.forEach((data, index) => {
      if (data) kept[index] = data;
      if (kept[index]) byIndex[index] = kept[index];
    });
    return mergePages(byIndex);
  }, [pages, prefixId]);

  return { posts, exhausted: pageData?.length === 0 };
}
