import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useSound } from "./useSound";
import { useToast } from "@/components/ui/Toast";
import {
  adjustProfileCount,
  friendlyFollowError,
  restoreSnapshot,
  retryTransientOnly,
  setCached,
  setInPeopleList,
  UNIQUE_VIOLATION,
  type FollowSnapshot,
} from "@/lib/followCache";
import type { Profile } from "../types/database";

/** Do I have a pending outgoing request to follow targetUserId? */
export function useHasPendingFollowRequest(targetUserId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["has-pending-follow-request", targetUserId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("follow_requests")
        .select("id")
        .eq("requester_id", user.id)
        .eq("target_id", targetUserId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!targetUserId,
  });
}

/**
 * Follow requests are instant on screen like follows are (see lib/followCache.ts): the tap flips the button and
 * plays its sound immediately, a rejected write restores the screen and says why. Writes are idempotent — asking
 * twice, or cancelling a request that's already gone, is never reported as a failure.
 */
export function useSendFollowRequest(targetUserId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { play } = useSound();
  const toast = useToast();
  const mutationKey = ["follow-request", targetUserId] as const;

  return useMutation<void, Error, void, { snap: FollowSnapshot }>({
    mutationKey,
    scope: { id: `follow-request:${user?.id ?? ""}:${targetUserId}` },
    retry: retryTransientOnly,
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("follow_requests")
        .insert({ requester_id: user.id, target_id: targetUserId });
      if (error && error.code !== UNIQUE_VIOLATION) throw error;
    },
    onMutate: () => {
      play("request-sent");
      const snap: FollowSnapshot = [];
      if (user && targetUserId) {
        void queryClient.cancelQueries({ queryKey: ["has-pending-follow-request", targetUserId] });
        setCached(queryClient, snap, ["has-pending-follow-request", targetUserId, user.id], true);
      }
      return { snap };
    },
    onError: (error, _v, context) => {
      if (queryClient.isMutating({ mutationKey }) <= 1) restoreSnapshot(queryClient, context?.snap);
      play("error");
      toast(friendlyFollowError(error, "Couldn't send the request. Please try again."), { variant: "error" });
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) > 1) return;
      queryClient.invalidateQueries({ queryKey: ["has-pending-follow-request", targetUserId] });
    },
  });
}

export function useCancelFollowRequest(targetUserId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { play } = useSound();
  const toast = useToast();
  const mutationKey = ["follow-request", targetUserId] as const;

  return useMutation<void, Error, void, { snap: FollowSnapshot }>({
    mutationKey,
    scope: { id: `follow-request:${user?.id ?? ""}:${targetUserId}` },
    retry: retryTransientOnly,
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("follow_requests")
        .delete()
        .eq("requester_id", user.id)
        .eq("target_id", targetUserId);
      if (error) throw error;
    },
    onMutate: () => {
      play("unfollow");
      const snap: FollowSnapshot = [];
      if (user && targetUserId) {
        void queryClient.cancelQueries({ queryKey: ["has-pending-follow-request", targetUserId] });
        setCached(queryClient, snap, ["has-pending-follow-request", targetUserId, user.id], false);
      }
      return { snap };
    },
    onError: (error, _v, context) => {
      if (queryClient.isMutating({ mutationKey }) <= 1) restoreSnapshot(queryClient, context?.snap);
      play("error");
      toast(friendlyFollowError(error, "Couldn't cancel the request. Please try again."), { variant: "error" });
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) > 1) return;
      queryClient.invalidateQueries({ queryKey: ["has-pending-follow-request", targetUserId] });
    },
  });
}

export interface IncomingFollowRequest {
  id: string;
  created_at: string;
  requester: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
}

/** Pending requests directed at ME — what the review page lists. */
export function useIncomingFollowRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["incoming-follow-requests", user?.id],
    queryFn: async (): Promise<IncomingFollowRequest[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("follow_requests")
        .select(
          `id, created_at, requester:profiles!follow_requests_requester_id_fkey(id, username, display_name, avatar_url)`
        )
        .eq("target_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as IncomingFollowRequest[];
    },
    enabled: !!user,
  });
}

export function useIncomingFollowRequestCount() {
  const { data } = useIncomingFollowRequests();
  return data?.length ?? 0;
}

type RequestVars = { id: string; requesterId: string };

/** Shared by accept + decline: the request leaves the list the instant it is tapped. */
function removeRequestOptimistically(
  queryClient: ReturnType<typeof useQueryClient>,
  snap: FollowSnapshot,
  me: string,
  requestId: string
) {
  void queryClient.cancelQueries({ queryKey: ["incoming-follow-requests", me] });
  const list = queryClient.getQueryData<IncomingFollowRequest[]>(["incoming-follow-requests", me]);
  if (Array.isArray(list)) setCached(queryClient, snap, ["incoming-follow-requests", me], list.filter((r) => r.id !== requestId));
}

function reconcileAfterRequestResolved(queryClient: ReturnType<typeof useQueryClient>, requesterId: string, targetId: string) {
  queryClient.invalidateQueries({ queryKey: ["incoming-follow-requests"] });
  queryClient.invalidateQueries({ queryKey: ["has-pending-follow-request", targetId] });
  queryClient.invalidateQueries({ queryKey: ["is-following", targetId] });
  queryClient.invalidateQueries({ queryKey: ["is-followed-by", requesterId] });
  queryClient.invalidateQueries({ queryKey: ["profile"] });
  queryClient.invalidateQueries({ queryKey: ["followers"] });
  queryClient.invalidateQueries({ queryKey: ["following"] });
}

export function useAcceptFollowRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { play } = useSound();
  const toast = useToast();

  return useMutation<void, Error, RequestVars, { snap: FollowSnapshot }>({
    mutationKey: ["follow-request-accept"],
    retry: retryTransientOnly,
    mutationFn: async (request) => {
      const { error } = await supabase.rpc("accept_follow_request", { request_id: request.id });
      if (error) throw error;
    },
    onMutate: (request) => {
      play("follow");
      const snap: FollowSnapshot = [];
      if (!user) return { snap };
      const incoming = queryClient
        .getQueryData<IncomingFollowRequest[]>(["incoming-follow-requests", user.id])
        ?.find((r) => r.id === request.id);
      removeRequestOptimistically(queryClient, snap, user.id, request.id);
      // The accept inserts follows(requester → me), which the DB counts on both profiles.
      adjustProfileCount(queryClient, snap, user.id, "follower_count", 1);
      adjustProfileCount(queryClient, snap, request.requesterId, "following_count", 1);
      setInPeopleList(queryClient, snap, "followers", user.id, incoming?.requester, request.requesterId, true);
      void queryClient.cancelQueries({ queryKey: ["is-followed-by", request.requesterId] });
      setCached(queryClient, snap, ["is-followed-by", request.requesterId, user.id], true);
      return { snap };
    },
    onError: (error, _request, context) => {
      restoreSnapshot(queryClient, context?.snap);
      play("error");
      toast(friendlyFollowError(error, "Couldn't accept the request. Please try again."), { variant: "error" });
    },
    onSettled: (_d, _e, request) => {
      if (!user) return;
      reconcileAfterRequestResolved(queryClient, request.requesterId, user.id);
    },
  });
}

export function useDeclineFollowRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { play } = useSound();
  const toast = useToast();

  return useMutation<void, Error, RequestVars, { snap: FollowSnapshot }>({
    mutationKey: ["follow-request-decline"],
    retry: retryTransientOnly,
    mutationFn: async (request) => {
      const { error } = await supabase.from("follow_requests").delete().eq("id", request.id);
      if (error) throw error;
    },
    onMutate: (request) => {
      play("unfollow");
      const snap: FollowSnapshot = [];
      if (user) removeRequestOptimistically(queryClient, snap, user.id, request.id);
      return { snap };
    },
    onError: (error, _request, context) => {
      restoreSnapshot(queryClient, context?.snap);
      play("error");
      toast(friendlyFollowError(error, "Couldn't decline the request. Please try again."), { variant: "error" });
    },
    onSettled: (_d, _e, request) => {
      if (!user) return;
      reconcileAfterRequestResolved(queryClient, request.requesterId, user.id);
    },
  });
}
