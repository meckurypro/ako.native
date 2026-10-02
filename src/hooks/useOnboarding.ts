// src/hooks/useOnboarding.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface OnboardingStatus {
  completed: boolean;
  hasInterests: boolean;
}

/**
 * Drives onboarding redirects (RequireAuth, OnboardingStepGuard) and
 * resume behavior. `hasInterests` lets us skip re-showing Welcome/
 * Interests to someone who started onboarding, left, and came back —
 * without a separate "current step" column (see
 * sql/31_onboarding_recommendations.sql).
 */
export function useOnboardingStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["onboarding-status", user?.id],
    queryFn: async (): Promise<OnboardingStatus> => {
      const [{ data: profile, error: profileError }, { data: interestRow, error: interestError }] =
        await Promise.all([
          supabase.from("profiles").select("onboarding_completed").eq("id", user!.id).single(),
          supabase.from("user_interests").select("user_id").eq("user_id", user!.id).limit(1).maybeSingle(),
        ]);

      if (profileError) throw profileError;
      if (interestError) throw interestError;

      return {
        completed: !!profile?.onboarding_completed,
        hasInterests: !!interestRow,
      };
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

/** Prefills the interest picker on resume, so re-visiting doesn't blank a prior selection. */
export function useMyInterestIds() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-interest-ids", user?.id],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("user_interests")
        .select("interest_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.interest_id);
    },
    enabled: !!user,
  });
}

/**
 * Saves the selected interest set, diffed against whatever's already
 * persisted — safe to call repeatedly (resume, retry after a network
 * failure, going back and changing selections) without hitting the
 * user_interests PK's UNIQUE(user_id, interest_id) constraint. Invalid
 * interest IDs are rejected server-side by the FK on interest_id.
 */
export function useSaveInterests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (interestIds: string[]) => {
      if (!user) throw new Error("Not signed in");

      const { data: existingRows, error: existingError } = await supabase
        .from("user_interests")
        .select("interest_id")
        .eq("user_id", user.id);
      if (existingError) throw existingError;

      const existing = new Set((existingRows ?? []).map((r) => r.interest_id));
      const next = new Set(interestIds);

      const toAdd = interestIds.filter((id) => !existing.has(id));
      const toRemove = [...existing].filter((id) => !next.has(id));

      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("user_interests")
          .insert(toAdd.map((interest_id) => ({ user_id: user.id, interest_id })));
        // 23505 = unique_violation — a concurrent retry already inserted
        // this row; the end state is what we wanted, so don't surface it.
        if (error && error.code !== "23505") throw error;
      }

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("user_interests")
          .delete()
          .eq("user_id", user.id)
          .in("interest_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["my-interest-ids", user?.id] });
    },
  });
}

export interface OnboardingRecommendation {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_private: boolean;
  follower_count: number;
  shared_interest_count: number;
  is_admin_suggested: boolean;
}

/**
 * Backed by get_onboarding_recommendations (SECURITY DEFINER — needs to
 * read other users' user_interests rows to score overlap, which the
 * normal "auth.uid() = user_id" RLS on that table correctly blocks
 * otherwise). staleTime: Infinity — the People step's ranking shouldn't
 * reshuffle mid-step just because a card re-rendered after a follow.
 */
export function useOnboardingRecommendations(limit = 12) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["onboarding-recommendations", user?.id, limit],
    queryFn: async (): Promise<OnboardingRecommendation[]> => {
      const { data, error } = await supabase.rpc("get_onboarding_recommendations", {
        p_limit: limit,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: Infinity,
  });
}

export function useCompleteOnboarding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-status", user?.id] });
    },
  });
}
