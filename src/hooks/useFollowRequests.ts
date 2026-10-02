import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
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

export function useSendFollowRequest(targetUserId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("follow_requests")
        .insert({ requester_id: user.id, target_id: targetUserId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["has-pending-follow-request", targetUserId] });
    },
  });
}

export function useCancelFollowRequest(targetUserId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("follow_requests")
        .delete()
        .eq("requester_id", user.id)
        .eq("target_id", targetUserId);
      if (error) throw error;
    },
    onSuccess: () => {
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

function invalidateAfterRequestResolved(
  queryClient: ReturnType<typeof useQueryClient>,
  requesterId: string,
  targetId: string
) {
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

  return useMutation({
    mutationFn: async (request: { id: string; requesterId: string }) => {
      const { error } = await supabase.rpc("accept_follow_request", {
        request_id: request.id,
      });
      if (error) throw error;
    },
    onSuccess: (_data, request) => {
      if (!user) return;
      invalidateAfterRequestResolved(queryClient, request.requesterId, user.id);
    },
  });
}

export function useDeclineFollowRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: { id: string; requesterId: string }) => {
      const { error } = await supabase.from("follow_requests").delete().eq("id", request.id);
      if (error) throw error;
    },
    onSuccess: (_data, request) => {
      if (!user) return;
      invalidateAfterRequestResolved(queryClient, request.requesterId, user.id);
    },
  });
}
