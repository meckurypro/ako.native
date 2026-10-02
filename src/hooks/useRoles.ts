// src/hooks/useRoles.ts

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Role } from "../types/database";

/**
 * The "job or hobby" list shown on a profile (Writer, Educator,
 * Programmer, etc.) — an admin-curated lookup table (see migration
 * 21), same pattern as categories/interests, rather than free text,
 * so the set stays consistent and could later support things like
 * "browse by role".
 */
export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, label, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data as Role[];
    },
    staleTime: 1000 * 60 * 60, // rarely changes — an hour is plenty
  });
}
