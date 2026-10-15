// src/components/post/PostList.tsx
// The virtualized list behind every post feed. Pull to refresh, load more near
// the end, empty/error states, and tracking of which cards are on screen (for
// per-card music). The floating top bar and bottom nav are accounted for in the
// content padding, and scrolling drives their auto-hide.
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { forwardRef, useCallback, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ActivityIndicator, View, type ViewToken } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { useTopBarInset } from "@/components/nav/AutoHideTopBar";
import { Text } from "@/components/ui/Text";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useTheme } from "@/theme/ThemeProvider";

export interface PostListItem {
  id: string;
}

interface PostListProps<T extends PostListItem> {
  posts: T[];
  renderPost: (post: T, ctx: { visible: boolean }) => ReactElement;
  isLoading: boolean;
  isFetchingMore?: boolean;
  error?: unknown;
  /** True once a page has come back empty. */
  exhausted?: boolean;
  onLoadMore?: () => void;
  onRefresh?: () => Promise<unknown> | void;
  emptyState?: ReactNode;
  loadingLabel?: string;
  /** Rendered above the first post, inside the scroll area. */
  header?: ReactNode;
  /** Reserve space for a floating top bar. Default true. */
  underTopBar?: boolean;
}

function ListError({ error }: { error: unknown }) {
  const e = error as { message?: string; hint?: string } | null;
  return (
    <Text className="break-words px-4 py-10 text-center text-sm text-danger">
      {`Couldn't load the feed: ${e?.message ?? String(error)}${e?.hint ? ` — hint: ${e.hint}` : ""}`}
    </Text>
  );
}

function PostListInner<T extends PostListItem>(
  {
    posts,
    renderPost,
    isLoading,
    isFetchingMore = false,
    error,
    exhausted = false,
    onLoadMore,
    onRefresh,
    emptyState,
    loadingLabel = "Loading…",
    header,
    underTopBar = true,
  }: PostListProps<T>,
  ref: React.ForwardedRef<FlashListRef<T>>
) {
  const { colors } = useTheme();
  const topInset = useTopBarInset();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  // Keep the caller's forwarded ref AND hand the list to the scroll-to-top arrow.
  const setListRef = useCallback(
    (node: FlashListRef<T> | null) => {
      onScroll.listRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref, onScroll.listRef]
  );
  const [visibleIds, setVisibleIds] = useState<ReadonlySet<string>>(new Set());
  const loadingMoreRef = useRef(false);

  const handleViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<T>[] }) => {
    setVisibleIds(new Set(viewableItems.map((v) => v.item?.id).filter((id): id is string => !!id)));
  }, []);

  const handleEndReached = useCallback(() => {
    if (!onLoadMore || exhausted || isFetchingMore || loadingMoreRef.current || posts.length === 0) return;
    loadingMoreRef.current = true;
    onLoadMore();
    // Re-arm once the new page has had a moment to land.
    setTimeout(() => {
      loadingMoreRef.current = false;
    }, 600);
  }, [onLoadMore, exhausted, isFetchingMore, posts.length]);

  const padTop = underTopBar ? topInset + 16 : 16;

  // Same refresh path as every other screen: re-probes connectivity (a stale "offline" flag can't leave the spinner
  // hanging), caps the spinner, and can't be re-triggered mid-flight. A post feed is self-contained (rows carry their
  // own counts), so it doesn't also refetch every other query on screen.
  const { refreshControl } = usePullToRefresh(() => onRefresh?.(), padTop, { refetchActive: false });

  if (isLoading && posts.length === 0) {
    return (
      <View className="flex-1 items-center justify-center" style={{ paddingTop: padTop }}>
        <Text className="text-ink-muted">{loadingLabel}</Text>
      </View>
    );
  }

  if (error && posts.length === 0) {
    return (
      <View style={{ paddingTop: padTop }}>
        <ListError error={error} />
      </View>
    );
  }

  return (
    <FlashList
      ref={setListRef}
      data={posts}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => renderPost(item, { visible: visibleIds.has(item.id) })}
      extraData={visibleIds}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onEndReached={handleEndReached}
      onEndReachedThreshold={1.5}
      onViewableItemsChanged={handleViewable}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60, minimumViewTime: 250 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? refreshControl : undefined}
      contentContainerStyle={{ paddingTop: padTop, paddingHorizontal: 20, paddingBottom: bottomInset }}
      ListHeaderComponent={header ? <>{header}</> : null}
      ListEmptyComponent={<>{emptyState}</>}
      ListFooterComponent={
        isFetchingMore && !exhausted ? (
          <View className="items-center py-4">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null
      }
    />
  );
}

export const PostList = forwardRef(PostListInner) as <T extends PostListItem>(
  props: PostListProps<T> & { ref?: React.ForwardedRef<FlashListRef<T>> }
) => ReactElement;
