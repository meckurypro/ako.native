// src/hooks/useOwnProfile.ts
// The signed-in user's full profile row for Settings (roles + privacy flags included).
import { useQuery } from "@tanstack/react-query";

import { PROFILE_ROLES_SELECT } from "../lib/profileRoles";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export function useOwnProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["own-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`*, ${PROFILE_ROLES_SELECT}, is_private, hide_followers_list, hide_following_list`)
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}
