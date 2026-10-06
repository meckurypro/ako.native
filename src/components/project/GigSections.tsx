// src/components/project/GigSections.tsx
// Gig-only sections on the project page: the creator's FAQ and customer reviews.
import { ChevronDown, Star } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAddGigReview, useCanReviewGig, useGigRatingSummary, useGigReviews } from "@/hooks/useGigReviews";
import { useTheme } from "@/theme/ThemeProvider";

function FaqRow({ item }: { item: { question: string; answer: string } }) {
  const [open, setOpen] = useState(false);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? "180deg" : "0deg", { duration: 200 }) }] }));
  return (
    <View className="overflow-hidden rounded-2xl border border-border/60 bg-surface">
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="flex-row items-center justify-between gap-2 px-4 py-3">
        <Text className="flex-1 text-sm font-medium text-ink">{item.question}</Text>
        <Animated.View style={chevron}>
          <Icon as={ChevronDown} size={15} className="text-ink-muted" />
        </Animated.View>
      </Pressable>
      {open ? <Text className="px-4 pb-3.5 text-sm text-ink-muted">{item.answer}</Text> : null}
    </View>
  );
}

export function GigFaqSection({ faq }: { faq: { question: string; answer: string }[] }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 font-display text-lg font-semibold tracking-tight text-ink">FAQ</Text>
      <View className="gap-2">
        {faq.map((item, i) => (
          <FaqRow key={i} item={item} />
        ))}
      </View>
    </View>
  );
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} color={n <= Math.round(rating) ? colors.accent : colors.border} fill={n <= Math.round(rating) ? colors.accent : "none"} />
      ))}
    </View>
  );
}

export function GigReviewsSection({ projectId }: { projectId: string }) {
  const { colors } = useTheme();
  const { data: reviews } = useGigReviews(projectId);
  const { average, count } = useGigRatingSummary(projectId);
  const canReview = useCanReviewGig(projectId);
  const addReview = useAddGigReview(projectId);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");

  async function handleSubmit() {
    await addReview.mutateAsync({ rating, reviewText: reviewText.trim() || undefined });
    setShowForm(false);
    setReviewText("");
  }

  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-display text-lg font-semibold tracking-tight text-ink">Reviews</Text>
        {canReview && !showForm ? (
          <Pressable onPress={() => setShowForm(true)} accessibilityRole="button">
            <Text className="text-sm font-medium text-accent">Leave a review</Text>
          </Pressable>
        ) : null}
      </View>

      {count > 0 && average !== null ? (
        <View className="mb-3 flex-row items-center gap-2">
          <StarRow rating={average} />
          <Text className="text-sm text-ink-muted">
            {average.toFixed(1)} · {count} review{count === 1 ? "" : "s"}
          </Text>
        </View>
      ) : null}

      {showForm ? (
        <View className="mb-3 rounded-xl border border-border bg-surface p-3">
          <View className="mb-2 flex-row items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setRating(n)} accessibilityRole="button" accessibilityLabel={`Rate ${n} stars`} hitSlop={4}>
                <Star size={22} color={n <= rating ? colors.accent : colors.border} fill={n <= rating ? colors.accent : "none"} />
              </Pressable>
            ))}
          </View>
          <TextInput
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="How did it go? (optional)"
            placeholderTextColor={colors.inkMuted}
            selectionColor={colors.accent}
            multiline
            maxLength={500}
            textAlignVertical="top"
            className="mb-2 rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink"
            style={{ fontFamily: "Inter_400Regular", minHeight: 76 }}
          />
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={addReview.isPending}
              accessibilityRole="button"
              className={`rounded-full bg-accent px-4 py-2 ${addReview.isPending ? "opacity-50" : ""}`}
            >
              <Text className="text-sm font-medium text-canvas">{addReview.isPending ? "Posting…" : "Post review"}</Text>
            </Pressable>
            <Pressable onPress={() => setShowForm(false)} accessibilityRole="button">
              <Text className="text-sm text-ink-muted">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!reviews || reviews.length === 0 ? (
        <Text className="text-sm text-ink-muted">No reviews yet.</Text>
      ) : (
        <View className="gap-3">
          {reviews.map((r) => (
            <View key={r.id} className="flex-row gap-2.5">
              <Avatar src={r.reviewer.avatar_url} name={r.reviewer.display_name} size="sm" />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <Text numberOfLines={1} className="shrink text-sm font-medium text-ink">
                    {r.reviewer.display_name}
                  </Text>
                  <StarRow rating={r.rating} size={11} />
                </View>
                {r.review_text ? <Text className="mt-0.5 text-sm text-ink-muted">{r.review_text}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
