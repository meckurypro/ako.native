// src/components/comments/CommentReplies.tsx
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { useCommentList, type StanceFilter } from "@/hooks/useComments";
import { CommentRow } from "./CommentRow";
import { useCommentEngagement } from "./CommentEngagement";
import { StanceFilterBar, type StanceCounts } from "./StanceFilter";

/**
 * The replies under whatever the page is about: a post's top-level comments (`parentCommentId = null`) or an
 * opened comment's direct replies. Stance filter on top, paged list below. Each row is tinted by its stance
 * toward this parent.
 */
export function CommentReplies({
  postId,
  parentCommentId,
  counts,
  total,
}: {
  postId: string;
  parentCommentId: string | null;
  /** Per-stance totals of this parent's direct replies (from the post or comment row itself). */
  counts: StanceCounts;
  /** Direct-reply total for the "All" tab. */
  total: number;
}) {
  const eng = useCommentEngagement();
  const [filter, setFilter] = useState<StanceFilter>("all");
  const list = useCommentList(postId, parentCommentId, filter);

  const rows = useMemo(() => (list.data?.pages ?? []).flat(), [list.data]);

  useEffect(() => {
    if (rows.length > 0) eng.register(rows.map((r) => r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <View accessibilityLabel="Replies">
      <StanceFilterBar counts={counts} total={total} value={filter} onChange={setFilter} />

      {list.isLoading ? (
        <Text className="py-8 text-center text-sm text-ink-muted">Loading…</Text>
      ) : list.isError ? (
        <View className="items-center py-8">
          <Text className="mb-2 text-sm text-ink-muted">Couldn't load replies.</Text>
          <Pressable onPress={() => void list.refetch()} accessibilityRole="button">
            <Text className="text-sm font-medium text-accent">Try again</Text>
          </Pressable>
        </View>
      ) : rows.length === 0 ? (
        <Text className="py-10 text-center text-sm text-ink-muted">{filter === "all" ? "No replies yet." : "Nothing here yet."}</Text>
      ) : (
        <View>
          {rows.map((c) => (
            <CommentRow key={c.id} comment={c} />
          ))}
          {list.hasNextPage ? (
            <Pressable
              onPress={() => void list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
              accessibilityRole="button"
              className={`flex-row items-center justify-center gap-2 py-4 ${list.isFetchingNextPage ? "opacity-60" : ""}`}
            >
              {list.isFetchingNextPage ? <ActivityIndicator size="small" /> : null}
              <Text className="text-sm font-medium text-accent">Show more replies</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}
