// src/screens/Discover.tsx
// Search plus two browse sections: Projects to explore and Pages to follow.
// Discover is for finding projects and pages — never people or posts.
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { AutoHideTopBar, useTopBarInset } from "@/components/nav/AutoHideTopBar";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { TopHeader } from "@/components/nav/TopHeader";
import { PageRow } from "@/components/post/PageRow";
import { ProjectMiniGrid } from "@/components/post/ProjectMiniCard";
import { isSearchable, SearchResults } from "@/components/post/SearchResults";
import { SearchField } from "@/components/post/SearchField";
import { Text } from "@/components/ui/Text";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSuggestedPages, useSuggestedProjects } from "@/hooks/useSearch";

export function Discover() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const topInset = useTopBarInset();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();

  const { data: suggestedProjects, isLoading: suggestedProjectsLoading, refetch: refetchProjects } = useSuggestedProjects();
  const { data: suggestedPages, isLoading: suggestedPagesLoading, refetch: refetchPages } = useSuggestedPages();
  const { refreshControl } = usePullToRefresh([refetchProjects, refetchPages], topInset + 16);

  const isSearching = isSearchable(query);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        refreshControl={refreshControl}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topInset + 16, paddingHorizontal: 16, paddingBottom: bottomInset }}
      >
        <View className="mb-6">
          <SearchField value={query} onChangeText={setQuery} placeholder="Search pages and projects…" />
        </View>

        {isSearching ? (
          <SearchResults query={debouncedQuery} isPending={query !== debouncedQuery} scope="discover" />
        ) : (
          <>
            <View className="mb-8">
              <Text className="mb-0.5 font-display text-xl text-ink">Projects to explore</Text>
              <Text className="mb-4 text-sm text-ink-muted">Popular and recent work from across Akọ.</Text>

              {suggestedProjectsLoading ? (
                <Text className="py-4 text-sm text-ink-muted">Loading…</Text>
              ) : suggestedProjects && suggestedProjects.length > 0 ? (
                <ProjectMiniGrid projects={suggestedProjects} />
              ) : (
                <Text className="py-4 text-sm text-ink-muted">No projects to show right now.</Text>
              )}
            </View>

            <View className="mb-8">
              <Text className="mb-0.5 font-display text-xl text-ink">Pages to follow</Text>
              <Text className="mb-4 text-sm text-ink-muted">Organisations, brands and products worth a look.</Text>

              {suggestedPagesLoading ? (
                <Text className="py-4 text-sm text-ink-muted">Loading…</Text>
              ) : suggestedPages && suggestedPages.length > 0 ? (
                suggestedPages.map((p) => (
                  <View key={p.id} className="border-b border-border">
                    <PageRow page={p} />
                  </View>
                ))
              ) : (
                <Text className="py-4 text-sm text-ink-muted">No pages to suggest right now.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <AutoHideTopBar>
        <TopHeader />
      </AutoHideTopBar>
    </View>
  );
}
