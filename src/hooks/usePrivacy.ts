import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { authRedirectUrl } from "@/lib/authLink";
import { useAuth } from "./useAuth";
import { useSound } from "./useSound";
import { verifyPassword } from "@/lib/verifyPassword";
import { useToast } from "@/components/ui/Toast";
import {
  adjustProfileCount,
  friendlyFollowError,
  restoreSnapshot,
  retryTransientOnly,
  setCached,
  setInPeopleList,
  type FollowSnapshot,
} from "@/lib/followCache";
import type { Profile } from "../types/database";

export function useIsBlocked(targetUserId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-blocked", targetUserId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("blocked_users")
        .select("blocker_id")
        .eq("blocker_id", user.id)
        .eq("blocked_id", targetUserId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!targetUserId,
  });
}

export function useToggleBlock(targetUserId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (currentlyBlocked: boolean) => {
      if (!user) throw new Error("Not signed in");

      if (currentlyBlocked) {
        const { error } = await supabase
          .from("blocked_users")
          .delete()
          .eq("blocker_id", user.id)
          .eq("blocked_id", targetUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("blocked_users")
          .insert({ blocker_id: user.id, blocked_id: targetUserId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["is-blocked", targetUserId] });
      queryClient.invalidateQueries({ queryKey: ["blocked-list"] });
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      queryClient.invalidateQueries({ queryKey: ["is-following"] });
    },
  });
}

export function useIsMuted(targetUserId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-muted", targetUserId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("muted_users")
        .select("muter_id")
        .eq("muter_id", user.id)
        .eq("muted_id", targetUserId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!targetUserId,
  });
}

export function useToggleMute(targetUserId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (currentlyMuted: boolean) => {
      if (!user) throw new Error("Not signed in");

      if (currentlyMuted) {
        const { error } = await supabase
          .from("muted_users")
          .delete()
          .eq("muter_id", user.id)
          .eq("muted_id", targetUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("muted_users")
          .insert({ muter_id: user.id, muted_id: targetUserId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["is-muted", targetUserId] });
      queryClient.invalidateQueries({ queryKey: ["muted-list"] });
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });
}

/**
 * Removes someone who follows ME from my followers — the reverse
 * direction of unfollow. Deletes their follows row (follower_id =
 * them, following_id = me); the existing "Users can unfollow" DELETE
 * policy only covers `follower_id = auth.uid()`, so this needs its
 * own RLS carve-out (see 32_remove_follower.sql) rather than reusing
 * useToggleFollow, which only ever deletes MY OWN follower_id row.
 */
export function useRemoveFollower(targetUserId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { play } = useSound();
  const toast = useToast();
  const mutationKey = ["remove-follower", targetUserId] as const;

  // Instant like the follow toggles (lib/followCache.ts): the follower disappears from the counter and list on tap.
  return useMutation<void, Error, void, { snap: FollowSnapshot }>({
    mutationKey,
    scope: { id: `remove-follower:${user?.id ?? ""}:${targetUserId}` },
    retry: retryTransientOnly,
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", targetUserId)
        .eq("following_id", user.id);
      if (error) throw error;
    },
    onMutate: () => {
      play("unfollow");
      const snap: FollowSnapshot = [];
      if (!user || !targetUserId) return { snap };
      void queryClient.cancelQueries({ queryKey: ["is-followed-by", targetUserId] });
      setCached(queryClient, snap, ["is-followed-by", targetUserId, user.id], false);
      adjustProfileCount(queryClient, snap, user.id, "follower_count", -1);
      adjustProfileCount(queryClient, snap, targetUserId, "following_count", -1);
      setInPeopleList(queryClient, snap, "followers", user.id, undefined, targetUserId, false);
      setInPeopleList(queryClient, snap, "following", targetUserId, undefined, user.id, false);
      return { snap };
    },
    onError: (error, _v, context) => {
      restoreSnapshot(queryClient, context?.snap);
      play("error");
      toast(friendlyFollowError(error, "Couldn't remove that follower. Please try again."), { variant: "error" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["is-followed-by", targetUserId] });
      queryClient.invalidateQueries({ queryKey: ["followers"] });
      queryClient.invalidateQueries({ queryKey: ["following"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useBlockedList() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["blocked-list", user?.id],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("blocked_users")
        .select(`blocked:profiles!blocked_users_blocked_id_fkey(*)`)
        .eq("blocker_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((row: any) => row.blocked).filter(Boolean);
    },
    enabled: !!user,
  });
}

export function useMutedList() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["muted-list", user?.id],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("muted_users")
        .select(`muted:profiles!muted_users_muted_id_fkey(*)`)
        .eq("muter_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((row: any) => row.muted).filter(Boolean);
    },
    enabled: !!user,
  });
}

/**
 * Shared implementation for the three own-profile boolean privacy
 * toggles (is_private, hide_followers_list, hide_following_list).
 *
 * Previously these fired a bare `.update()` with no optimistic write:
 * the switch didn't move until the round trip finished, and if the
 * update failed (RLS, network, etc.) the query would just refetch the
 * old value with no explanation — the toggle appeared to silently
 * "not work." This now flips the cache immediately and rolls back to
 * the exact previous value on error, surfacing the failure via the
 * mutation's own `error` field instead of hiding it.
 */
function useTogglePrivacyField(field: "is_private" | "hide_followers_list" | "hide_following_list" | "show_groups_on_profile") {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["own-profile", user?.id];

  return useMutation({
    mutationFn: async (value: boolean) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ [field]: value })
        .eq("id", user.id);
      if (error) throw error;
      return value;
    },
    onMutate: async (value: boolean) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) =>
        old ? { ...old, [field]: value } : old
      );
      return { previous };
    },
    onError: (_err, _value, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["own-profile"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useTogglePrivateAccount() {
  return useTogglePrivacyField("is_private");
}

export function useToggleHideFollowersList() {
  return useTogglePrivacyField("hide_followers_list");
}

export function useToggleHideFollowingList() {
  return useTogglePrivacyField("hide_following_list");
}

// Opt-in: whether the public groups you're in appear on your profile (private groups never do).
export function useToggleShowGroupsOnProfile() {
  return useTogglePrivacyField("show_groups_on_profile");
}

/**
 * Changes the signed-in user's password. Re-verifies the current
 * password via signInWithPassword first — Supabase's updateUser()
 * will happily change the password on any active session without
 * this, but skipping it would let anyone at an already-unlocked
 * device change the password with no proof of the old one.
 */
export function useChangePassword() {
  const { user } = useAuth();
  // The toast provider sits above the whole app, so these toasts still show if the form remounts mid-request.
  const toast = useToast();

  return useMutation({
    mutationFn: async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => {
      if (!user?.email) throw new Error("Not signed in");

      // Checked on a separate client so the signed-in session (and every listener on it) is left alone.
      const ok = await verifyPassword(user.email, currentPassword);
      if (!ok) throw new Error("Current password is incorrect.");

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;
    },
    onMutate: () => toast("Updating password…", { variant: "loading" }),
    onSuccess: (_data, _vars, loadingToast) => {
      loadingToast?.dismiss();
      toast("Password updated.", { variant: "success" });
    },
    onError: (err, _vars, loadingToast) => {
      loadingToast?.dismiss();
      toast(err instanceof Error && err.message === "Current password is incorrect." ? err.message : "Couldn't update your password.", { variant: "error" });
    },
  });
}

/**
 * Emails the signed-in user a password-reset link. Anyone can use this — it is the way in for an account that signed
 * up with Google (no password yet) and for someone who forgot their current one.
 */
export function useSendPasswordReset() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error("Not signed in");
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: authRedirectUrl(),
      });
      if (error) throw error;
      return user.email;
    },
  });
}

/**
 * Calls deactivate-account — a soft delete + auth ban, never a hard
 * delete (see edge_functions/deactivate-account/index.ts for why:
 * the wallet ledger's ON DELETE RESTRICT constraint makes a true
 * hard-delete unsafe for anyone with financial history).
 */
export function useDeactivateAccount() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("deactivate-account");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });
}
