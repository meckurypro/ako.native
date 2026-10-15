// src/hooks/useAccumulatedPages.ts
// The paged feed hooks return one page at a time (page 0, 1, 2…). This stitches
// them into one growing list, resets when the feed identity changes (switching
// Page mode, a topic filter…), and reports when a page came back empty so the
// list knows to stop asking for more.
//
// Pages are stored by index and REPLACED, never appended: React Query refetches the page you're on (pull to refresh,
// invalidation after a like/comment/gift, returning to the app) and each refetch hands back a new array — appending
// that duplicated the whole page. The merge also drops repeated ids (offset paging overlaps when the ranking shifts).
import { useEffect, useMemo, useState } from "react";

import { mergePages } from "@/lib/refresh";

export function useAccumulatedPages<T extends { id: string }>(pageData: T[] | undefined, page: number, resetKey: unknown) {
  const [pages, setPages] = useState<Record<number, T[]>>({});
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setPages({});
    setExhausted(false);
  }, [resetKey]);

  useEffect(() => {
    if (!pageData) return;
    // Page 0 starts the list over (a refresh); a deeper page fills its own slot.
    setPages((prev) => (page === 0 ? { 0: pageData } : { ...prev, [page]: pageData }));
    setExhausted(pageData.length === 0);
  }, [pageData, page]);

  const posts = useMemo(() => mergePages(pages), [pages]);
  return { posts, exhausted };
}
