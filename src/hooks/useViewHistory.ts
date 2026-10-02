// src/hooks/useViewHistory.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { PAGE_SELECT } from "../lib/postSelects";

// One row in the Activity hub's "History" list — a post or project
// the user has opened, most-recently-viewed first. post_views and
// project_views are two separate tables (see useMarkPostSeen /
// useMarkProjectSeen), stitched together client-side same as
// useActivity does for events/meetings/rooms.
export interface HistoryItem {
  kind: "post" | "project";
  viewedAt: string;
  post?: any;
  project?: any;
}

const POST_VIEWS_LIMIT = 50;
const PROJECT_VIEWS_LIMIT = 50;

export function useViewHistory() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["view-history", user?.id],
    queryFn: async (): Promise<HistoryItem[]> => {
      const [postViewsRes, projectViewsRes] = await Promise.all([
        supabase
          .from("post_views")
          .select(
            `viewed_at, post:posts!post_views_post_id_fkey(*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, tier), ${PAGE_SELECT})`
          )
          .eq("user_id", user!.id)
          .order("viewed_at", { ascending: false })
          .limit(POST_VIEWS_LIMIT),
        supabase
          .from("project_views")
          .select(`viewed_at, project:projects!project_views_project_id_fkey(*)`)
          .eq("user_id", user!.id)
          .order("viewed_at", { ascending: false })
          .limit(PROJECT_VIEWS_LIMIT),
      ]);

      if (postViewsRes.error) throw postViewsRes.error;
      if (projectViewsRes.error) throw projectViewsRes.error;

      const items: HistoryItem[] = [
        ...((postViewsRes.data as any[]) ?? [])
          .filter((row) => row.post)
          .map((row): HistoryItem => ({ kind: "post", viewedAt: row.viewed_at, post: row.post })),
        ...((projectViewsRes.data as any[]) ?? [])
          .filter((row) => row.project)
          .map((row): HistoryItem => ({ kind: "project", viewedAt: row.viewed_at, project: row.project })),
      ];

      return items.sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());
    },
    enabled: !!user,
  });
}
