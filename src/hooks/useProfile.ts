import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useSound } from "./useSound";
import { useActiveIdentity } from "./usePages";
import { PROFILE_ROLES_SELECT, toProfileRoles } from "../lib/profileRoles";
import type { Profile, ProfileWithRoles } from "../types/database";

export function useProfileByUsername(username: string) {
  return useQuery({
    queryKey: ["profile", username],
    queryFn: async (): Promise<ProfileWithRoles> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`*, ${PROFILE_ROLES_SELECT}`)
        .eq("username", username)
        .single();
      if (error) throw error;
      const { profile_roles, ...profile } = data as any;
      return { ...profile, roles: toProfileRoles(profile_roles) };
    },
    enabled: !!username,
  });
}

/**
 * The signed-in user's own id/username/avatar — just enough for the
 * TopHeader avatar link. Keyed by user id so it shares cache with
 * anything else that happens to fetch the same slice later.
 */
export function useMyProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async (): Promise<Pick<Profile, "id" | "username" | "display_name" | "avatar_url">> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useUserPosts(userId: string) {
  return useQuery({
    queryKey: ["user-posts", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          `*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, tier, is_private, is_verified, ${PROFILE_ROLES_SELECT})`
        )
        .eq("author_id", userId)
        .is("posted_as_page_id", null)
        .eq("is_deleted", false)
        .eq("is_archived", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((post: any) => {
        const { profile_roles, ...author } = post.author;
        return { ...post, author: { ...author, roles: toProfileRoles(profile_roles) } };
      });
    },
    enabled: !!userId,
  });
}

export function useIsFollowing(targetUserId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-following", targetUserId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!targetUserId,
  });
}

/**
 * The reverse of useIsFollowing: does targetUserId follow ME. Powers
 * "Follow back" (I don't follow them, but they follow me) and the
 * mutual-follow "you and X are friends" unfollow reminder (I follow
 * them AND they follow me).
 */
export function useIsFollowedByUser(targetUserId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-followed-by", targetUserId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", targetUserId)
        .eq("following_id", user.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!targetUserId,
  });
}

/**
 * Toggles a follow on/off for the SIGNED-IN PERSON — always writes to
 * `follows`, never page_follows_target, regardless of active identity.
 * Kept around for flows that are unambiguously personal (see
 * FindPeople.tsx, reached during onboarding before any page can
 * exist). ProfilePage's main Follow/Unfollow button used to call this
 * unconditionally too — that was the actual bug behind item 7's
 * report ("page mode: some follow buttons say Follow, others say
 * Unfollow, for the same account"). It's identity-aware now (see
 * useToggleFollowAsActiveIdentity below), matching the card-level
 * FollowButton, so every follow control on screen agrees regardless
 * of which one you happen to tap.
 */
export function useToggleFollow(targetUserId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { play } = useSound();

  return useMutation({
    mutationFn: async (currentlyFollowing: boolean) => {
      if (!user) throw new Error("Not signed in");

      if (currentlyFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", targetUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: user.id, following_id: targetUserId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, currentlyFollowing) => {
      if (!currentlyFollowing) play("follow");

      queryClient.invalidateQueries({ queryKey: ["is-following", targetUserId] });
      queryClient.invalidateQueries({ queryKey: ["is-followed-by", targetUserId] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["followers"] });
      queryClient.invalidateQueries({ queryKey: ["following"] });
    },
  });
}

/**
 * Follow-state check that's aware of the CURRENT acting identity —
 * personal account, or a page. Reads the matching table so a page's
 * own follow button state doesn't show "Following" just because the
 * team member behind it personally follows that profile (or vice
 * versa). See sql/29_page_identity_engagement.sql for page_follows_target.
 */
export function useIsFollowingAsActiveIdentity(targetUserId: string) {
  const { user } = useAuth();
  const { data: identity } = useActiveIdentity();
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;

  return useQuery({
    queryKey: ["is-following-as-identity", targetUserId, user?.id, actingAsPageId],
    queryFn: async () => {
      if (!user) return false;

      if (actingAsPageId) {
        const { data } = await supabase
          .from("page_follows_target")
          .select("page_id")
          .eq("page_id", actingAsPageId)
          .eq("followed_profile_id", targetUserId)
          .maybeSingle();
        return !!data;
      }

      const { data } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user.id)
        .eq("following_id", targetUserId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!targetUserId,
  });
}

/**
 * Toggles a follow as whichever identity is currently active — the
 * signed-in person if in Personal mode, or the page if in Page mode.
 * This is the fix for item 7: previously every follow, everywhere in
 * the app (including from inside a post/project card while acting as
 * a page), went through useToggleFollow above and landed on the
 * team member's own personal `follows` row no matter what. Now used
 * by both FollowButton.tsx (the compact card control) AND
 * ProfilePage's main Follow/Unfollow button — the personal and page
 * follow relationships are stored in separate tables (follows vs
 * page_follows_target), so switching identity was never a data
 * problem, only a "which table is this screen reading/writing right
 * now" one. Each identity's own follow state is exactly where it was
 * the moment you switch back to it.
 */
export function useToggleFollowAsActiveIdentity(targetUserId: string) {
  const { user } = useAuth();
  const { data: identity } = useActiveIdentity();
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;
  const queryClient = useQueryClient();
  const { play } = useSound();

  return useMutation({
    mutationFn: async (currentlyFollowing: boolean) => {
      if (!user) throw new Error("Not signed in");

      if (actingAsPageId) {
        if (currentlyFollowing) {
          const { error } = await supabase
            .from("page_follows_target")
            .delete()
            .eq("page_id", actingAsPageId)
            .eq("followed_profile_id", targetUserId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("page_follows_target")
            .insert({ page_id: actingAsPageId, followed_profile_id: targetUserId });
          if (error) throw error;
        }
        return;
      }

      if (currentlyFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", targetUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: user.id, following_id: targetUserId });
        if (error) throw error;
      }
    },
    onSuccess: (_data, currentlyFollowing) => {
      if (!currentlyFollowing) play("follow");

      queryClient.invalidateQueries({ queryKey: ["is-following-as-identity", targetUserId] });
      queryClient.invalidateQueries({ queryKey: ["is-following", targetUserId] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["followers"] });
      queryClient.invalidateQueries({ queryKey: ["following"] });
      if (actingAsPageId) {
        queryClient.invalidateQueries({ queryKey: ["page", actingAsPageId] });
        queryClient.invalidateQueries({ queryKey: ["my-pages"] });
      }
    },
  });
}

export function useFollowers(userId: string) {
  return useQuery({
    queryKey: ["followers", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follows")
        .select(`follower:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url, bio, tier)`)
        .eq("following_id", userId);
      if (error) throw error;
      return data.map((row: any) => row.follower) as Profile[];
    },
    enabled: !!userId,
  });
}

export function useFollowing(userId: string) {
  return useQuery({
    queryKey: ["following", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follows")
        .select(`following:profiles!follows_following_id_fkey(id, username, display_name, avatar_url, bio, tier)`)
        .eq("follower_id", userId);
      if (error) throw error;
      return data.map((row: any) => row.following) as Profile[];
    },
    enabled: !!userId,
  });
}

interface UpdateProfileInput {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  website_url?: string;
  username?: string;
}

export function useUpdateProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: UpdateProfileInput) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("profiles").update(input).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      // Settings' own profile lookup, plus the two username-keyed caches
      // (TopHeader's avatar link, BottomNav's "is this my own profile"
      // check) — a username change makes both stale immediately, not
      // just the ["profile", oldUsername] lookup above.
      queryClient.invalidateQueries({ queryKey: ["own-profile"] });
      queryClient.invalidateQueries({ queryKey: ["my-username"] });
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });
}

/**
 * Replaces the signed-in user's job/hobby tags in one atomic call
 * (delete + reinsert with position, via the set_profile_roles RPC).
 * roleIds is treated as ordered — index 0 becomes position 1, etc.
 */
export function useUpdateProfileRoles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (roleIds: string[]) => {
      if (!user) throw new Error("Not signed in");
      if (roleIds.length > 3) throw new Error("You can select up to 3 job/hobby tags.");
      const { error } = await supabase.rpc("set_profile_roles", { p_role_ids: roleIds });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["own-profile"] });
    },
  });
}
