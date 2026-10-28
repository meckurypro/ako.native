// src/hooks/usePostDetail.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { PROFILE_ROLES_SELECT, toProfileRoles } from "../lib/profileRoles";
import { PAGE_SELECT, TAGGED_PROJECT_SELECT } from "../lib/postSelects";
import type { PostWithAuthor } from "../types/database";

const POST_SELECT = `*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, tier, is_private, ${PROFILE_ROLES_SELECT}), remover:profiles!posts_deleted_by_fkey(username, display_name), ${PAGE_SELECT}, ${TAGGED_PROJECT_SELECT}`;

// Unlike the feed queries, this one must also return deleted/archived rows the viewer is allowed to see, so the
// page can say WHY a post is gone.
export interface PostDetailData extends PostWithAuthor {
  is_deleted: boolean;
  is_archived: boolean;
  deleted_by: string | null;
  remover: { username: string; display_name: string } | null;
}

/**
 * One post for its own page (and as the context row above an opened comment). Same ["post", id] key the
 * optimistic-counter patching already knows about (see POST_QUERY_ROOTS), so likes/stance counts move live.
 */
export function usePost(postId: string | undefined) {
  return useQuery({
    queryKey: ["post", postId],
    queryFn: async (): Promise<PostDetailData | null> => {
      const { data, error } = await supabase.from("posts").select(POST_SELECT).eq("id", postId!).maybeSingle();
      if (error) throw error;
      if (!data) return null; // RLS hid it entirely — deleted/archived and the viewer has no special access

      const raw = data as unknown as PostDetailData & { author: { profile_roles?: unknown } | null };
      return {
        ...raw,
        author: raw.author ? { ...raw.author, roles: toProfileRoles(raw.author.profile_roles as never) } : raw.author,
      } as PostDetailData;
    },
    enabled: !!postId,
  });
}
