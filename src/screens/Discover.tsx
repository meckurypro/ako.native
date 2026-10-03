// src/screens/Discover.tsx
// Search plus three browse sections: People to follow, Pages to follow, and
// Topics (an accordion of interests — tapping one filters the feed by it).
import { ChevronDown } from "lucide-react-native";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

import { AutoHideTopBar, useTopBarInset } from "@/components/nav/AutoHideTopBar";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { TopHeader } from "@/components/nav/TopHeader";
import { PageRow } from "@/components/post/PageRow";
import { PersonRow } from "@/components/post/PersonRow";
import { isSearchable, SearchResults } from "@/components/post/SearchResults";
import { SearchField } from "@/components/post/SearchField";
import { Collapsible } from "@/components/ui/Collapsible";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useActiveIdentity } from "@/hooks/usePages";
import { useCategories } from "@/hooks/useCategories";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePageSuggestedPeople } from "@/hooks/usePageDiscover";
import { useSuggestedPages, useSuggestedPeople } from "@/hooks/useSearch";
import { haptics } from "@/lib/haptics";

function Chevron({ open }: { open: boolean }) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? "180deg" : "0deg", { duration: 300 }) }] }));
  return (
    <Animated.View style={style}>
      <Icon as={ChevronDown} size={18} className="text-ink-muted" />
    </Animated.View>
  );
}

export function Discover() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const topInset = useTopBarInset();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();

  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const { data: identity } = useActiveIdentity();
  const activePageId = identity?.mode === "page" ? identity.page.id : undefined;
  const personalSuggestions = useSuggestedPeople();
  const pageSuggestions = usePageSuggestedPeople(activePageId);
  const { data: suggestedPeople, isLoading: suggestedLoading } = activePageId ? pageSuggestions : personalSuggestions;
  const { data: suggestedPages, isLoading: suggestedPagesLoading } = useSuggestedPages();

  const isSearching = isSearchable(query);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
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
                suggestedPeople.map((p) => (
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
                suggestedPages.map((p) => (
                  <View key={p.id} className="border-b border-border">
                    <PageRow page={p} />
                  </View>
                ))
              ) : (
                <Text className="py-4 text-sm text-ink-muted">No pages to suggest right now.</Text>
              )}
            </View>

            <View>
              <Text className="mb-0.5 font-display text-xl text-ink">Topics</Text>
              <Text className="mb-4 text-sm text-ink-muted">Explore by what you care about.</Text>

              {categoriesLoading ? (
                <Text className="py-4 text-sm text-ink-muted">Loading…</Text>
              ) : (
                categories?.map((category) => {
                  const isOpen = openCategoryId === category.id;
                  return (
                    <View key={category.id} className="border-b border-border">
                      <Pressable
                        onPress={() => {
                          haptics.selection();
                          setOpenCategoryId((curr) => (curr === category.id ? null : category.id));
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                        className="flex-row items-center justify-between py-4"
                      >
                        <Text className="font-display text-base text-ink">{category.name}</Text>
                        <Chevron open={isOpen} />
                      </Pressable>

                      <Collapsible open={isOpen}>
                        <View className="flex-row flex-wrap gap-2 pb-4">
                          {category.interests.map((interest) => (
                            <Pressable
                              key={interest.id}
                              onPress={() => router.navigate({ pathname: "/feed", params: { interest: interest.id } })}
                              accessibilityRole="button"
                              className="rounded-full border border-border bg-surface px-3.5 py-2 active:border-accent/50"
                            >
                              <Text className="text-sm text-ink">{interest.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </Collapsible>
                    </View>
                  );
                })
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
