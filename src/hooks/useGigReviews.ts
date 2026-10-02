// src/hooks/useGigReviews.ts
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useHasPurchased } from "./useProjects";

export interface GigReview {
  id: string;
  project_id: string;
  reviewer_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  reviewer: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

// Requires gig_reviews from ako_projects_v7_gig_extras.sql — reads
// fail soft to an empty list rather than crashing the page if that
// migration hasn't run yet, same pattern as Course's progress table.
export function useGigReviews(projectId: string | undefined) {
  return useQuery({
    queryKey: ["gig-reviews", projectId],
    queryFn: async (): Promise<GigReview[]> => {
      const { data, error } = await supabase
        .from("gig_reviews")
        .select("*, reviewer:profiles!gig_reviews_reviewer_id_fkey(username, display_name, avatar_url)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("gig_reviews unavailable — has the migration run yet?", error);
        return [];
      }
      return (data ?? []) as unknown as GigReview[];
    },
    enabled: !!projectId,
  });
}

export function useGigRatingSummary(projectId: string | undefined) {
  const { data: reviews } = useGigReviews(projectId);
  return useMemo(() => {
    if (!reviews || reviews.length === 0) return { average: null as number | null, count: 0 };
    const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    return { average, count: reviews.length };
  }, [reviews]);
}

// A buyer can review a gig once they've actually booked it (a
// `purchases` row exists — the same check the insert's RLS policy
// makes server-side, this is just for hiding the form when it would
// obviously be rejected) and haven't already left one.
export function useCanReviewGig(projectId: string | undefined) {
  const { user } = useAuth();
  const hasPurchasedQuery = useHasPurchased(projectId ?? "");
  const { data: reviews } = useGigReviews(projectId);
  const alreadyReviewed = !!reviews?.some((r) => r.reviewer_id === user?.id);
  return !!user && !!hasPurchasedQuery.data && !alreadyReviewed;
}

export function useAddGigReview(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rating, reviewText }: { rating: number; reviewText?: string }) => {
      if (!user) throw new Error("Sign in to leave a review.");
      const { error } = await supabase.from("gig_reviews").insert({
        project_id: projectId,
        reviewer_id: user.id,
        rating,
        review_text: reviewText?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gig-reviews", projectId] }),
  });
}
