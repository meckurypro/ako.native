// src/hooks/useLoadingBudget.ts
// Caps how long a "loading" flag may stay true. A query that is fetching over a dead-but-"connected" network reports
// isLoading until the OS times the request out (a minute or more); screens that gate on it would sit on a spinner
// that whole time. After `budgetMs` this reports false, so the screen moves on with what it has.
import { useEffect, useState } from "react";

export function useLoadingBudget(loading: boolean, budgetMs = 3000): boolean {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!loading) {
      setExpired(false);
      return;
    }
    const t = setTimeout(() => setExpired(true), budgetMs);
    return () => clearTimeout(t);
  }, [loading, budgetMs]);
  return loading && !expired;
}
