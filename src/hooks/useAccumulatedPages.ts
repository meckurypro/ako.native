// src/hooks/useAccumulatedPages.ts
// The paged feed hooks return one page at a time (page 0, 1, 2…). This stitches
// them into one growing list, resets when the feed identity changes (switching
// Page mode, a topic filter…), and reports when a page came back empty so the
// list knows to stop asking for more.
import { useEffect, useState } from "react";

export function useAccumulatedPages<T>(pageData: T[] | undefined, page: number, resetKey: unknown) {
  const [all, setAll] = useState<T[]>([]);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setAll([]);
    setExhausted(false);
  }, [resetKey]);

  useEffect(() => {
    if (!pageData) return;
    setAll((prev) => (page === 0 ? pageData : [...prev, ...pageData]));
    setExhausted(pageData.length === 0);
  }, [pageData, page]);

  return { posts: all, exhausted };
}
