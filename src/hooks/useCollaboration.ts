// src/hooks/useCollaboration.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export type CollaborationTarget = "post" | "project";
export type CollaborationStatus = "invited" | "accepted" | "declined" | "removed";

export interface Collaborator {
  status: CollaborationStatus;
  invited_at: string;
  responded_at: string | null;
  invited_by: string;
  user: { id: string; username: string; display_name: string; avatar_url: string | null };
  // Project-only — what this person is credited as contributing (e.g.
  // "Cinematographer"). Null for post collaborators, or when no role
  // was assigned on invite.
  role_label: string | null;
}

function tableFor(target: CollaborationTarget) {
  return target === "post" ? "post_collaborators" : "project_collaborators";
}
function idColumnFor(target: CollaborationTarget) {
  return target === "post" ? "post_id" : "project_id";
}

/** Everyone invited/collaborating on a given post or project, accepted-first. */
export function useCollaborators(target: CollaborationTarget, targetId: string | undefined) {
  return useQuery({
    queryKey: ["collaborators", target, targetId],
    queryFn: async (): Promise<Collaborator[]> => {
      if (!targetId) return [];
      const roleSelect = target === "project" ? ", role:gig_roles(label)" : "";
      const { data, error } = await supabase
        .from(tableFor(target))
        .select(
          `status, invited_at, responded_at, invited_by, user:profiles!${tableFor(target)}_user_id_fkey(id, username, display_name, avatar_url)${roleSelect}`
        )
        .eq(idColumnFor(target), targetId)
        .neq("status", "removed")
        .order("status", { ascending: true }); // "accepted" < "declined" < "invited" alphabetically — good enough default grouping
      if (error) throw error;
      return (data as any[]).map((row) => ({
        ...row,
        role_label: (Array.isArray(row.role) ? row.role[0] : row.role)?.label ?? null,
      })) as Collaborator[];
    },
    enabled: !!targetId,
  });
}

/** Sends a collaboration request — inserting the row is the request; the DB trigger notifies the invitee.
 *  roleId is project-only (post_collaborators has no role_id column) — what this person is being
 *  credited as contributing (e.g. Cinematographer). Optional; an accepted invite with a role tags it,
 *  which can trigger automatic Gig setup for the invitee (see AKO_DYNAMIC_PROFILE_PORTFOLIOS spec §11). */
export function useSendCollaborationRequest(target: CollaborationTarget) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetId, userId, roleId }: { targetId: string; userId: string; roleId?: string }) => {
      if (!user) throw new Error("Not signed in.");
      const { error } = await supabase.from(tableFor(target)).insert({
        [idColumnFor(target)]: targetId,
        user_id: userId,
        invited_by: user.id,
        ...(target === "project" && roleId ? { role_id: roleId } : {}),
      });
      if (error) {
        if (error.code === "23505") throw new Error("Already invited to collaborate on this.");
        throw error;
      }
    },
    onSuccess: (_data, { targetId }) => {
      queryClient.invalidateQueries({ queryKey: ["collaborators", target, targetId] });
    },
  });
}

export interface PendingPostCollaborationInvite {
  post_id: string;
  invited_by: string;
  invited_at: string;
  inviter: { id: string; username: string; display_name: string; avatar_url: string | null };
  // Null when the post has been deleted since the invite was sent —
  // the row itself survives (FK has no cascade delete here), so this
  // is the expected shape for "no longer available", not an error case.
  post: {
    id: string;
    content: string;
    media_urls: string[];
    created_at: string;
    is_archived: boolean;
    author: { id: string; username: string; display_name: string; avatar_url: string | null };
  } | null;
}

export interface PendingProjectCollaborationInvite {
  project_id: string;
  invited_by: string;
  invited_at: string;
  inviter: { id: string; username: string; display_name: string; avatar_url: string | null };
  project: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    project_type: string;
    created_at: string;
  } | null;
}

/** Pending collaboration invites addressed to the current user, across both posts and projects. */
export function useMyPendingCollaborationInvites() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-collaboration-invites", user?.id],
    queryFn: async (): Promise<{
      posts: PendingPostCollaborationInvite[];
      projects: PendingProjectCollaborationInvite[];
    }> => {
      if (!user) return { posts: [], projects: [] };
      const [postsRes, projectsRes] = await Promise.all([
        supabase
          .from("post_collaborators")
          .select(
            `post_id, invited_by, invited_at,
             inviter:profiles!post_collaborators_invited_by_fkey(id, username, display_name, avatar_url),
             post:posts!post_collaborators_post_id_fkey(id, content, media_urls, created_at, is_archived, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url))`
          )
          .eq("user_id", user.id)
          .eq("status", "invited"),
        supabase
          .from("project_collaborators")
          .select(
            `project_id, invited_by, invited_at,
             inviter:profiles!project_collaborators_invited_by_fkey(id, username, display_name, avatar_url),
             project:projects!project_collaborators_project_id_fkey(id, title, description, thumbnail_url, project_type, created_at)`
          )
          .eq("user_id", user.id)
          .eq("status", "invited"),
      ]);
      if (postsRes.error) throw postsRes.error;
      if (projectsRes.error) throw projectsRes.error;

      // Supabase's generated types can't tell these FK embeds are
      // to-one, so it infers them as arrays even though the DB
      // returns a single row (or null, for `post`/`project`, when the
      // referenced row was hard-deleted). Unwrap every such field here
      // so every consumer gets a plain object/null.
      const unwrap = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]) => {
        const out = { ...row };
        for (const key of keys) {
          const value = out[key];
          (out as any)[key] = Array.isArray(value) ? (value[0] ?? null) : value;
        }
        return out;
      };

      return {
        posts: (postsRes.data ?? []).map((row: any) => unwrap(row, ["inviter", "post"])) as PendingPostCollaborationInvite[],
        projects: (projectsRes.data ?? []).map((row: any) =>
          unwrap(row, ["inviter", "project"])
        ) as PendingProjectCollaborationInvite[],
      };
    },
    enabled: !!user,
  });
}

/** Accept or decline a pending invite — the DB trigger notifies whoever sent it. */
export function useRespondToCollaborationRequest(target: CollaborationTarget) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetId, accept }: { targetId: string; accept: boolean }) => {
      if (!user) throw new Error("Not signed in.");
      const { error } = await supabase
        .from(tableFor(target))
        .update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() })
        .eq(idColumnFor(target), targetId)
        .eq("user_id", user.id)
        .eq("status", "invited");
      if (error) throw error;
    },
    onSuccess: (_data, { targetId }) => {
      queryClient.invalidateQueries({ queryKey: ["collaborators", target, targetId] });
      queryClient.invalidateQueries({ queryKey: ["my-collaboration-invites", user?.id] });
    },
  });
}

/** Withdraws an invite (by the inviter) or leaves a collaboration (by the collaborator). */
export function useRemoveCollaborator(target: CollaborationTarget) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetId, userId }: { targetId: string; userId: string }) => {
      const { error } = await supabase
        .from(tableFor(target))
        .update({ status: "removed" })
        .eq(idColumnFor(target), targetId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_data, { targetId }) => {
      queryClient.invalidateQueries({ queryKey: ["collaborators", target, targetId] });
    },
  });
}
