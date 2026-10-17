// src/components/project/book/BookReviewsSection.tsx
// Rating summary and reviews for a book, shown on the project page to signed-in users so they
// can judge the book before committing to it. Reviewing itself happens inside the reader.
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useBookRatingSummary, useBookReviews } from "@/hooks/useBookReviews";
import { useTheme } from "@/theme/ThemeProvider";

import { StarRow } from "./Stars";

const PREVIEW_COUNT = 5;

export function BookReviewsSection({ projectId }: { projectId: string }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: reviews, isLoading } = useBookReviews(projectId);
  const { data: summary } = useBookRatingSummary(projectId);
  const [showAll, setShowAll] = useState(false);

  const count = summary?.count ?? reviews?.length ?? 0;
  const average = summary?.average ?? null;
  const visible = showAll ? reviews : reviews?.slice(0, PREVIEW_COUNT);

  return (
    <View className="mb-4">
      <Text className="mb-2 font-display text-lg font-semibold tracking-tight text-ink">Reviews</Text>

      {count > 0 && average !== null ? (
        <View className="mb-3 flex-row items-center gap-2">
          <StarRow rating={average} size={16} on={colors.accent} off={colors.border} />
          <Text className="text-sm text-ink-muted">{`${average.toFixed(1)} · ${count} review${count === 1 ? "" : "s"}`}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <Text className="text-sm text-ink-muted">Loading reviews…</Text>
      ) : !reviews || reviews.length === 0 ? (
        <Text className="text-sm text-ink-muted">No reviews yet. Readers can rate this book from inside the reader.</Text>
      ) : (
        <>
          <View style={{ gap: 14 }}>
            {visible?.map((r) => (
              <View key={r.id} className="flex-row gap-2.5">
                <Avatar src={r.reviewer.avatar_url} name={r.reviewer.display_name} size="sm" />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text numberOfLines={1} className="shrink text-sm font-medium text-ink">
                      {r.reviewer.display_name + (r.reviewer_id === user?.id ? " (you)" : "")}
                    </Text>
                    <StarRow rating={r.rating} size={11} on={colors.accent} off={colors.border} />
                  </View>
                  {r.review_text ? <Text className="mt-0.5 text-sm text-ink-muted">{r.review_text}</Text> : null}
                  <Text className="mt-0.5 text-xs text-ink-muted">
                    {new Date(r.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          {reviews.length > PREVIEW_COUNT ? (
            <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" hitSlop={8} className="mt-3 self-start">
              <Text className="text-sm font-medium text-accent">{showAll ? "Show fewer" : `Show all ${reviews.length} reviews`}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}
