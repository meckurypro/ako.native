// src/hooks/useBookReviews.ts
// Reviews for books. Readers leave one rating (1-5) and an optional note from inside the
// reader; signed-in users read them on the project page before they commit to the book.
// Server rules live in supabase/ako_book_reviews.sql (RLS + can_review_book): the owner can't
// review their own book and only someone who can open it can review it.
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface BookReview {
  id: string;
  project_id: string;
  reviewer_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
  reviewer: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export const MAX_REVIEW_LENGTH = 1000;

const reviewsKey = (projectId: string | undefined) => ["book-reviews", projectId] as const;
const summaryKey = (projectId: string | undefined) => ["book-rating-summary", projectId] as const;
const canReviewKey = (projectId: string | undefined, userId: string | undefined) =>
  ["can-review-book", projectId, userId] as const;

// Reads fail soft to an empty list so the project page never breaks if the migration is missing.
export function useBookReviews(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: reviewsKey(projectId),
    queryFn: async (): Promise<BookReview[]> => {
      const { data, error } = await supabase
        .from("book_reviews")
        .select("*, reviewer:profiles!book_reviews_reviewer_id_fkey(username, display_name, avatar_url)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("book_reviews unavailable", error);
        return [];
      }
      return (data ?? []) as unknown as BookReview[];
    },
    enabled: !!projectId && !!user,
  });
}

export function useBookRatingSummary(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: summaryKey(projectId),
    queryFn: async (): Promise<{ average: number | null; count: number }> => {
      const { data, error } = await supabase.rpc("book_rating_summary", { p_project_id: projectId });
      if (error) {
        console.warn("book_rating_summary unavailable", error);
        return { average: null, count: 0 };
      }
      const row = Array.isArray(data) ? data[0] : data;
      const count = Number(row?.review_count ?? 0);
      return { average: count > 0 && row?.average != null ? Number(row.average) : null, count };
    },
    enabled: !!projectId && !!user,
  });
}

/** The signed-in reader's own review of this book, if they've left one. */
export function useMyBookReview(projectId: string | undefined) {
  const { user } = useAuth();
  const { data: reviews, isLoading } = useBookReviews(projectId);
  const mine = useMemo(() => reviews?.find((r) => r.reviewer_id === user?.id) ?? null, [reviews, user?.id]);
  return { review: mine, isLoading };
}

/** True when the signed-in user may review this book (not the owner, and has access to it). */
export function useCanReviewBook(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: canReviewKey(projectId, user?.id),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("can_review_book", { p_project_id: projectId });
      if (error) return false;
      return data === true;
    },
    enabled: !!projectId && !!user,
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateReviews(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewsKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: summaryKey(projectId) }),
    ]);
}

/** Creates the review, or replaces the reader's earlier one (one review per reader per book). */
export function useSaveBookReview(projectId: string) {
  const { user } = useAuth();
  const invalidate = useInvalidateReviews(projectId);
  return useMutation({
    mutationFn: async ({ rating, reviewText }: { rating: number; reviewText?: string }) => {
      if (!user) throw new Error("Sign in to leave a review.");
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Pick a rating from 1 to 5.");
      const { error } = await supabase.from("book_reviews").upsert(
        {
          project_id: projectId,
          reviewer_id: user.id,
          rating,
          review_text: reviewText?.trim().slice(0, MAX_REVIEW_LENGTH) || null,
        },
        { onConflict: "project_id,reviewer_id" }
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteBookReview(projectId: string) {
  const { user } = useAuth();
  const invalidate = useInvalidateReviews(projectId);
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in first.");
      const { error } = await supabase
        .from("book_reviews")
        .delete()
        .eq("project_id", projectId)
        .eq("reviewer_id", user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
