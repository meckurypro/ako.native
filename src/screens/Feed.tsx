// src/screens/Feed.tsx
// Home: For You · Top Discussions · Following, as a drag-tracking tab carousel.
// Each tab is its own virtualized list (so each keeps its own scroll position),
// under a header that slides away on scroll-down together with the bottom nav.
import { router, useLocalSearchParams } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import type { FlashListRef } from "@shopify/flash-list";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { AutoHideTopBar } from "@/components/nav/AutoHideTopBar";
import { TopHeader } from "@/components/nav/TopHeader";
import { PostCard } from "@/components/post/PostCard";
import { PostList } from "@/components/post/PostList";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/styled";
import { SwipeableTabs } from "@/components/ui/SwipeableTabs";
import { Text } from "@/components/ui/Text";
import { useAccumulatedPages } from "@/hooks/useAccumulatedPages";
import { usePageFollowingFeed, usePageRankedFeed } from "@/hooks/usePageFeed";
import { useActiveIdentity } from "@/hooks/usePages";
import { useFeedPosts, useFollowingFeed, usePostById, useTopDiscussionsFeed } from "@/hooks/usePosts";
import { useTabState } from "@/hooks/useTabState";
import { haptics } from "@/lib/haptics";
import type { PostWithAuthor } from "@/types/database";

const TABS = [
  { key: "for-you", label: "For You" },
  { key: "top", label: "Top Discussions" },
  { key: "following", label: "Following" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map((t) => t.key);

function EmptyState({ message }: { message: string }) {
  return <Text className="py-16 text-center text-sm text-ink-muted">{message}</Text>;
}

/** A feed card, flashing briefly when it's the post the user just published / returned to. */
function FeedPostRow({ post, isTarget, active, visible }: { post: PostWithAuthor; isTarget: boolean; active: boolean; visible: boolean }) {
  const [flashing, setFlashing] = useState(isTarget);

  useEffect(() => {
    if (!isTarget) return;
    setFlashing(true);
    const timeout = setTimeout(() => setFlashing(false), 2500);
    return () => clearTimeout(timeout);
  }, [isTarget]);

  return (
    <View className={`rounded-lg ${flashing ? "-mx-2 bg-highlight px-2 py-1.5" : ""}`}>
      <PostCard post={post} active={active} visible={visible} />
    </View>
  );
}

function ForYouTab({
  interestId,
  justPostedId,
  scrollToPostId,
  active,
}: {
  interestId?: string;
  justPostedId?: string | null;
  scrollToPostId?: string | null;
  active: boolean;
}) {
  const [page, setPage] = useState(0);
  const { data: identity } = useActiveIdentity();
  const activePageId = identity?.mode === "page" ? identity.page.id : undefined;
  const isPageMode = !!activePageId && !interestId;
  const listRef = useRef<FlashListRef<PostWithAuthor>>(null);

  // Both hooks always run (rules of hooks); the one that doesn't apply is disabled by its args.
  const personal = useFeedPosts(interestId, page);
  const pageFeed = usePageRankedFeed(isPageMode ? activePageId : undefined, page);
  const current = isPageMode ? pageFeed : personal;
  const { data: pagePosts, isLoading, isFetching, error, refetch } = current;
  const { posts, exhausted } = useAccumulatedPages<PostWithAuthor>(pagePosts as PostWithAuthor[] | undefined, page, interestId ?? (isPageMode ? activePageId : "personal"));

  useEffect(() => setPage(0), [interestId, isPageMode]);

  // A just-published post is pinned to the top of the first page, and the feed
  // waits for it so the new post is never missing from a stale list.
  const pinning = !!justPostedId && page === 0 && !interestId && !isPageMode;
  const { data: justPostedPost, isLoading: isLoadingJustPosted, isError: justPostedFailed } = usePostById(pinning ? justPostedId : null);
  const waitingForFreshFeed = pinning && (isLoading || isFetching || (isLoadingJustPosted && !justPostedFailed));

  // Returning from a post to where you were: if it isn't in the loaded pages, fetch it and show it first.
  const scrollTargetInList = !!scrollToPostId && posts.some((p) => p.id === scrollToPostId);
  const { data: fetchedScrollToPost } = usePostById(scrollToPostId && !scrollTargetInList ? scrollToPostId : null);

  const displayed = useMemo(() => {
    let list = justPostedPost ? [justPostedPost, ...posts.filter((p) => p.id !== justPostedPost.id)] : posts;
    if (fetchedScrollToPost) list = [fetchedScrollToPost, ...list.filter((p) => p.id !== fetchedScrollToPost.id)];
    return list as PostWithAuthor[];
  }, [posts, justPostedPost, fetchedScrollToPost]);

  // Scroll the target into view once it's in the list.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!scrollToPostId || scrolledRef.current) return;
    const index = displayed.findIndex((p) => p.id === scrollToPostId);
    if (index < 0) return;
    scrolledRef.current = true;
    setTimeout(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 }), 250);
  }, [displayed, scrollToPostId]);

  const noPostsYet = displayed.length === 0 && page === 0 && !isLoading && !waitingForFreshFeed;

  return (
    <PostList
      ref={listRef}
      posts={displayed}
      isLoading={(isLoading || waitingForFreshFeed) && page === 0}
      isFetchingMore={isFetching && page > 0}
      error={error}
      exhausted={exhausted}
      loadingLabel="Loading your feed…"
      onLoadMore={() => setPage((p) => p + 1)}
      onRefresh={async () => {
        if (page === 0) await refetch();
        else setPage(0);
      }}
      renderPost={(post, { visible }) => (
        <FeedPostRow post={post} isTarget={!!scrollToPostId && post.id === scrollToPostId} active={active} visible={visible && active} />
      )}
      emptyState={
        noPostsYet ? (
          <View className="items-center py-16">
            <Text className="mb-4 text-ink-muted">No posts yet. Be the first to share a thought.</Text>
            <View className="w-48">
              <Button onPress={() => router.push("/compose")}>Write something</Button>
            </View>
          </View>
        ) : null
      }
    />
  );
}

function FollowingTab({ active }: { active: boolean }) {
  const [page, setPage] = useState(0);
  const { data: identity } = useActiveIdentity();
  const activePageId = identity?.mode === "page" ? identity.page.id : undefined;
  const isPageMode = !!activePageId;

  const personal = useFollowingFeed(page);
  const pageFeed = usePageFollowingFeed(isPageMode ? activePageId : undefined, page);
  const { data: pagePosts, isLoading, isFetching, error, refetch } = isPageMode ? pageFeed : personal;
  const { posts, exhausted } = useAccumulatedPages<PostWithAuthor>(pagePosts as PostWithAuthor[] | undefined, page, isPageMode ? activePageId : "personal");

  useEffect(() => setPage(0), [isPageMode]);

  return (
    <PostList
      posts={posts}
      isLoading={isLoading && page === 0}
      isFetchingMore={isFetching && page > 0}
      error={error}
      exhausted={exhausted}
      onLoadMore={() => setPage((p) => p + 1)}
      onRefresh={async () => {
        if (page === 0) await refetch();
        else setPage(0);
      }}
      renderPost={(post, { visible }) => <PostCard post={post} active={active} visible={visible && active} />}
      emptyState={
        posts.length === 0 && page === 0 && !isLoading ? (
          <EmptyState message="No posts from people you follow yet. Follow a few people to see their posts here." />
        ) : null
      }
    />
  );
}

function TopDiscussionsTab({ active }: { active: boolean }) {
  const [page, setPage] = useState(0);
  const { data: pagePosts, isLoading, isFetching, error, refetch } = useTopDiscussionsFeed(page);
  const { posts, exhausted } = useAccumulatedPages<PostWithAuthor>(pagePosts as PostWithAuthor[] | undefined, page, "top");

  return (
    <PostList
      posts={posts}
      isLoading={isLoading && page === 0}
      isFetchingMore={isFetching && page > 0}
      error={error}
      exhausted={exhausted}
      onLoadMore={() => setPage((p) => p + 1)}
      onRefresh={async () => {
        if (page === 0) await refetch();
        else setPage(0);
      }}
      renderPost={(post, { visible }) => <PostCard post={post} active={active} visible={visible && active} />}
      emptyState={
        posts.length === 0 && page === 0 && !isLoading ? <EmptyState message="Nothing's picked up much discussion in the last week yet." /> : null
      }
    />
  );
}

export function Feed() {
  const params = useLocalSearchParams<{ interest?: string; justPostedId?: string; scrollToPostId?: string }>();
  const interestId = params.interest || undefined;

  // One-shot navigation hints: read once, then strip them so a later refocus doesn't replay them.
  const [justPostedId] = useState<string | null>(() => params.justPostedId ?? null);
  const [scrollToPostId] = useState<string | null>(() => params.scrollToPostId ?? null);
  useEffect(() => {
    if (justPostedId || scrollToPostId) router.setParams({ justPostedId: undefined, scrollToPostId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activeTab, setActiveTab] = useTabState<TabKey>(TAB_KEYS, "for-you");
  const activeIndex = TABS.findIndex((t) => t.key === activeTab);

  // Tab indicator follows the finger on the UI thread via the carousel's shared progress value.
  const progress = useSharedValue(activeIndex);
  const [barWidth, setBarWidth] = useState(0);
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (barWidth / TABS.length) }],
  }));

  // A tab only starts fetching once it has been visited (the carousel mounts neighbours early).
  const [visitedTabs, setVisitedTabs] = useState<boolean[]>(() => TABS.map((_, i) => i === activeIndex));
  useEffect(() => {
    setVisitedTabs((prev) => (prev[activeIndex] ? prev : prev.map((v, i) => v || i === activeIndex)));
  }, [activeIndex]);

  useEffect(() => {
    if (interestId) setActiveTab("for-you");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interestId]);

  return (
    <View className="flex-1 bg-canvas">
      <SwipeableTabs
        index={activeIndex}
        progress={progress}
        onIndexChange={(i) => {
          haptics.selection();
          setActiveTab(TABS[i].key);
        }}
      >
        <ForYouTab key="for-you" interestId={interestId} justPostedId={justPostedId} scrollToPostId={scrollToPostId} active={visitedTabs[0]} />
        <TopDiscussionsTab key="top" active={visitedTabs[1]} />
        <FollowingTab key="following" active={visitedTabs[2]} />
      </SwipeableTabs>

      <AutoHideTopBar>
        <TopHeader leftAction="create" />

        <View className="px-4">
          <View className="relative w-full max-w-xl flex-row self-center pb-1" onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
            {TABS.map((tab, i) => (
              <Pressable
                key={tab.key}
                onPress={() => {
                  if (i === activeIndex) return;
                  haptics.selection();
                  setActiveTab(tab.key);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === tab.key }}
                className="flex-1 items-center pb-2 pt-1"
              >
                <Text numberOfLines={1} className={`text-sm font-semibold ${activeTab === tab.key ? "text-accent" : "text-ink-muted"}`}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
            <Animated.View
              className="absolute bottom-0 left-0 h-[4px] rounded-full bg-accent"
              style={[{ width: barWidth / TABS.length }, indicatorStyle]}
            />
          </View>
        </View>

        {activeTab === "for-you" && interestId ? (
          <View className="px-5 pb-1 pt-3">
            <Pressable
              onPress={() => router.setParams({ interest: undefined })}
              accessibilityRole="button"
              className="flex-row items-center gap-1.5 self-start rounded-full bg-accent-soft px-3 py-1.5"
            >
              <Text className="text-sm text-accent">Filtered by topic</Text>
              <Icon as={X} size={14} className="text-accent" />
            </Pressable>
          </View>
        ) : null}
      </AutoHideTopBar>
    </View>
  );
}
