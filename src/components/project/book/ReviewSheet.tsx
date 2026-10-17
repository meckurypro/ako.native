// src/components/project/book/ReviewSheet.tsx
// "Rate & Review" bottom sheet inside the book reader. One review per reader per book:
// opening it again edits the earlier one. Colours come from the reader theme so it matches the page.
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { MAX_REVIEW_LENGTH, useDeleteBookReview, useMyBookReview, useSaveBookReview } from "@/hooks/useBookReviews";
import type { ReaderThemeSpec } from "@/lib/bookReaderTheme";
import { haptics } from "@/lib/haptics";

import { Sheet } from "./ReaderSheets";
import { StarPicker } from "./Stars";

const LABELS = ["", "Didn't like it", "It was okay", "Liked it", "Really liked it", "Loved it"];

export function ReviewSheet({
  theme,
  projectId,
  bookTitle,
  initialRating,
  onClose,
}: {
  theme: ReaderThemeSpec;
  projectId: string;
  bookTitle: string;
  /** Pre-selected stars when the sheet opens from the end-of-book prompt. */
  initialRating?: number;
  onClose: () => void;
}) {
  const { review } = useMyBookReview(projectId);
  const save = useSaveBookReview(projectId);
  const remove = useDeleteBookReview(projectId);
  const [rating, setRating] = useState(initialRating ?? 0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const touched = useRef(initialRating != null);

  // Fill in the earlier review once it arrives, unless the reader has already started editing.
  useEffect(() => {
    if (review && !touched.current) {
      setRating(review.rating);
      setText(review.review_text ?? "");
    }
  }, [review]);

  const busy = save.isPending || remove.isPending;

  async function submit() {
    if (rating < 1) {
      setError("Tap a star to rate the book.");
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({ rating, reviewText: text });
      haptics.success();
      onClose();
    } catch {
      setError("Couldn't save your review. Check your connection and try again.");
    }
  }

  async function removeReview() {
    setError(null);
    try {
      await remove.mutateAsync();
      onClose();
    } catch {
      setError("Couldn't delete your review. Try again.");
    }
  }

  const fieldBg = theme.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";

  return (
    <Sheet
      theme={theme}
      title={review ? "Your review" : "Rate this book"}
      subtitle={
        <Text className="mt-0.5 text-[13px]" numberOfLines={1} style={{ color: theme.muted }}>
          {bookTitle}
        </Text>
      }
      onClose={onClose}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 16 }}>
        <View style={{ alignItems: "center", gap: 6, paddingVertical: 4 }}>
          <StarPicker
            value={rating}
            onChange={(n) => {
              touched.current = true;
              setRating(n);
            }}
            on={theme.accent}
            off={theme.rule}
          />
          <Text className="text-[13px]" style={{ color: theme.muted, height: 20 }}>
            {LABELS[rating] ?? ""}
          </Text>
        </View>

        <View>
          <TextInput
            value={text}
            onChangeText={(t) => {
              touched.current = true;
              setText(t);
            }}
            maxLength={MAX_REVIEW_LENGTH}
            multiline
            textAlignVertical="top"
            placeholder="What did you think? (optional)"
            placeholderTextColor={theme.muted}
            selectionColor={theme.accent}
            style={{ minHeight: 110, borderRadius: 12, borderWidth: 1, borderColor: theme.rule, backgroundColor: fieldBg, color: theme.ink, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" }}
          />
          <Text className="mt-1 text-right text-xs" style={{ color: theme.muted }}>
            {`${text.length}/${MAX_REVIEW_LENGTH}`}
          </Text>
        </View>

        {error ? (
          <Text className="text-[13px]" accessibilityRole="alert" style={{ color: theme.ink }}>
            {error}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            onPress={() => void submit()}
            disabled={busy}
            accessibilityRole="button"
            style={{ flex: 1, alignItems: "center", borderRadius: 999, paddingVertical: 13, backgroundColor: theme.ink, opacity: busy ? 0.5 : 1 }}
          >
            <Text className="text-[15px] font-semibold" style={{ color: theme.bg }}>
              {save.isPending ? "Saving…" : review ? "Update review" : "Post review"}
            </Text>
          </Pressable>
          {review ? (
            <Pressable
              onPress={() => void removeReview()}
              disabled={busy}
              accessibilityRole="button"
              style={{ borderRadius: 999, borderWidth: 1, borderColor: theme.rule, paddingHorizontal: 16, paddingVertical: 12, opacity: busy ? 0.5 : 1 }}
            >
              <Text className="text-sm" style={{ color: theme.muted }}>
                {remove.isPending ? "Deleting…" : "Delete"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}
