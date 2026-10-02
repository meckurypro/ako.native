import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Category, Interest } from "../types/database";

export interface CategoryWithInterests extends Category {
  interests: Interest[];
}

/**
 * Fetches all active categories with their nested active interests,
 * for use in the onboarding interest-picker and post-composer topic
 * selector. Both admin-managed tables, so this list changes over time
 * without any frontend code needing to change.
 */
export function useCategories() {
  return useQuery({
    queryKey: ["categories-with-interests"],
    queryFn: async (): Promise<CategoryWithInterests[]> => {
      const { data: categories, error: catError } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (catError) throw catError;

      const { data: interests, error: intError } = await supabase
        .from("interests")
        .select("*")
        .eq("is_active", true);

      if (intError) throw intError;

      return (categories ?? []).map((category) => ({
        ...category,
        interests: (interests ?? []).filter((i) => i.category_id === category.id),
      }));
    },
    // Categories/interests change rarely — safe to cache for a while
    staleTime: 5 * 60 * 1000,
  });
}
