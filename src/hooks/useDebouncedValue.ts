// src/hooks/useDebouncedValue.ts
import { useEffect, useState } from "react";

/**
 * Returns `value`, but only after it's stopped changing for `delayMs`.
 * No debounce utility existed anywhere in the app before this — Search.tsx
 * was firing a `search-posts` and a `search-people` query (one of them a
 * leading-wildcard `ilike`, which can't use an index) on every single
 * keystroke. This is the one place that needed it enough to justify a
 * shared hook rather than a one-off timer inline.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
