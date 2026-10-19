// src/hooks/useRecentSearches.ts
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  removeRecentSearch,
} from "../lib/recentSearches";

/** The signed-in user's recent searches, with add / remove / clear. */
export function useRecentSearches() {
  const { user } = useAuth();
  const userId = user?.id;
  const [items, setItems] = useState<string[]>(() => getRecentSearches(userId));

  // Re-read when the account changes (account switcher) so one account's
  // history never shows under another.
  useEffect(() => {
    setItems(getRecentSearches(userId));
  }, [userId]);

  const add = useCallback((term: string) => setItems(addRecentSearch(userId, term)), [userId]);
  const remove = useCallback((term: string) => setItems(removeRecentSearch(userId, term)), [userId]);
  const clear = useCallback(() => {
    clearRecentSearches(userId);
    setItems([]);
  }, [userId]);

  return { items, add, remove, clear };
}
