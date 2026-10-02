// src/hooks/usePageDiscover.ts
//
// Page-mode counterpart to useSuggestedPeople() in useSearch.ts. When
// acting as a page, "People to follow" should reflect the PAGE's own
// network — who follows the page, who the page already follows — not
// whichever team member happens to be switched into it.
//
// Partially buildable today, partially not:
//   - "boost people who already follow this page" works NOW — that's
//     the existing public.page_follows table (an account following a
//     page), no schema change needed.
//   - "exclude people the page already follows" does NOT work yet —
//     pages have no follow list of their own. Needs page_follows_target
//     from usePageFeed.ts's backend-contract note. Left as a TODO below
//     rather than silently wrong; until that table exists this will
//     suggest people the page may already follow.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { ProfileWithRoles } from "../types/database";

const PEOPLE_SELECT = `id, username, display_name, avatar_url, tier, follower_count`;

function normalizeProfile(raw: any): ProfileWithRoles {
  return { ...raw, roles: [] } as ProfileWithRoles;
}

export function usePageSuggestedPeople(pageId: string | undefined) {
  return useQuery({
    queryKey: ["page-suggested-people", pageId],
    queryFn: async (): Promise<ProfileWithRoles[]> => {
      if (!pageId) return [];

      const [candidatesRes, followersRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(PEOPLE_SELECT)
          .eq("is_deleted", false)
          .order("follower_count", { ascending: false })
          .limit(30),
        supabase.from("page_follows").select("follower_id").eq("page_id", pageId),
      ]);
      if (candidatesRes.error) throw candidatesRes.error;
      if (followersRes.error) throw followersRes.error;

      // TODO once page_follows_target exists: fetch it here and
      // .filter(p => !alreadyFollowedIds.has(p.id)) below, same as
      // useSuggestedPeople does with followingIds today.
      const followerIds = new Set((followersRes.data ?? []).map((f) => f.follower_id));

      return (candidatesRes.data ?? [])
        .map(normalizeProfile)
        .map((p) => ({ p, score: followerIds.has(p.id) ? 2 : 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(({ p }) => p);
    },
    enabled: !!pageId,
  });
}
