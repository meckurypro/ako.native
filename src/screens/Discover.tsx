// src/screens/Discover.tsx
// Search plus three short browse sections: People to follow, Pages to follow, and Topics.
// Deliberately light, like RestrictedDiscover: a handful of suggestions per section (search is the way to find
// more), and Topics is ONE scrolling row of interest chips — tapping one filters the feed by it. (It used to be an
// accordion of every category, which buried the page.)
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { AutoHideTopBar, useTopBarInset } from "@/components/nav/AutoHideTopBar";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { TopHeader } from "@/components/nav/TopHeader";
import { PageRow } from "@/components/post/PageRow";
import { PersonRow } from "@/components/post/PersonRow";
import { isSearchable, SearchResults } from "@/components/post/SearchResults";
import { SearchField } from "@/components/post/SearchField";
import { Text } from "@/components/ui/Text";
import { useActiveIdentity } from "@/hooks/usePages";
import { useCategories } from "@/hooks/useCategories";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { usePageSuggestedPeople } from "@/hooks/usePageDiscover";
import { useSuggestedPages, useSuggestedPeople } from "@/hooks/useSearch";
import { RestrictedDiscover } from "./RestrictedDiscover";
import { haptics } from "@/lib/haptics";

// How many suggestions each section shows, and how many topic chips.
const SUGGESTION_LIMIT = 5;
const TOPIC_LIMIT = 16;

function FullDiscover() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const topInset = useTopBarInset();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();

  const { data: categories, refetch: refetchCategories } = useCategories();
  // One flat row of interests across all categories — no accordion.
  const topics = useMemo(() => (categories ?? []).flatMap((c) => c.interests).slice(0, TOPIC_LIMIT), [categories]);
  const { data: identity } = useActiveIdentity();
  const activePageId = identity?.mode === "page" ? identity.page.id : undefined;
  const personalSuggestions = useSuggestedPeople();
  const pageSuggestions = usePageSuggestedPeople(activePageId);
  const { data: suggestedPeople, isLoading: suggestedLoading, refetch: refetchPeople } = activePageId ? pageSuggestions : personalSuggestions;
  const { data: suggestedPages, isLoading: suggestedPagesLoading, refetch: refetchPages } = useSuggestedPages();
  // Only the suggestion query in use is refetched; the other one is disabled and refetch() would still hit the network.
  const { refreshControl } = usePullToRefresh([refetchCategories, refetchPeople, refetchPages], topInset + 16);

  const isSearching = isSearchable(query);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        refreshControl={refreshControl}
        ref={onScroll.listRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topInset + 16, paddingHorizontal: 16, paddingBottom: bottomInset }}
      >
        <View className="mb-6">
          <SearchField value={query} onChangeText={setQuery} placeholder="Search people, pages, posts…" />
        </View>

        {isSearching ? (
          <SearchResults query={debouncedQuery} isPending={query !== debouncedQuery} />
        ) : (
          <>
            <View className="mb-8">
              <Text className="mb-0.5 font-display text-xl text-ink">People to follow</Text>
              <Text className="mb-4 text-sm text-ink-muted">
                {activePageId ? "Based on this page's network and activity." : "Based on your network and activity."}
              </Text>

              {suggestedLoading ? (
                <Text className="py-4 text-sm text-ink-muted">Loading…</Text>
              ) : suggestedPeople && suggestedPeople.length > 0 ? (
                suggestedPeople.slice(0, SUGGESTION_LIMIT).map((p) => (
                  <View key={p.id} className="border-b border-border">
                    <PersonRow profile={p} />
                  </View>
                ))
              ) : (
                <Text className="py-4 text-sm text-ink-muted">No suggestions right now.</Text>
              )}
            </View>

            <View className="mb-8">
              <Text className="mb-0.5 font-display text-xl text-ink">Pages to follow</Text>
              <Text className="mb-4 text-sm text-ink-muted">Organisations, brands and products worth a look.</Text>

              {suggestedPagesLoading ? (
                <Text className="py-4 text-sm text-ink-muted">Loading…</Text>
              ) : suggestedPages && suggestedPages.length > 0 ? (
                suggestedPages.slice(0, SUGGESTION_LIMIT).map((p) => (
                  <View key={p.id} className="border-b border-border">
                    <PageRow page={p} />
                  </View>
                ))
              ) : (
                <Text className="py-4 text-sm text-ink-muted">No pages to suggest right now.</Text>
              )}
            </View>

            {topics.length > 0 ? (
              <View>
                <Text className="mb-0.5 font-display text-xl text-ink">Topics</Text>
                <Text className="mb-4 text-sm text-ink-muted">Explore by what you care about.</Text>

                {/* Bleeds to the screen edges (negative margin cancels the page padding) so chips scroll off cleanly. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={{ marginHorizontal: -16 }}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
                >
                  {topics.map((interest) => (
                    <Pressable
                      key={interest.id}
                      onPress={() => {
                        haptics.selection();
                        router.navigate({ pathname: "/feed", params: { interest: interest.id } });
                      }}
                      accessibilityRole="button"
                      className="rounded-full border border-border bg-surface px-3.5 py-2 active:border-accent-a50"
                    >
                      <Text className="text-sm text-ink">{interest.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <AutoHideTopBar>
        <TopHeader />
      </AutoHideTopBar>
    </View>
  );
}

export function Discover() {
  return useIsRestricted() ? <RestrictedDiscover /> : <FullDiscover />;
}
