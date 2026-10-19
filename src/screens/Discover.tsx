// src/screens/Discover.tsx
// Discover for full accounts: a TikTok-style search (see DiscoverShell) over three short browse
// sections — topic chips, People to follow, and Pages to follow.
// Deliberately light, like RestrictedDiscover: a handful of suggestions per section (search is the
// way to find more), and Topics is ONE scrolling row of interest chips — tapping one filters the
// feed by it. (It used to be an accordion of every category, which buried the page.)
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { SectionHeader } from "@/components/discover/SectionHeader";
import { DiscoverShell } from "@/components/discover/DiscoverShell";
import { PageRow } from "@/components/post/PageRow";
import { PersonRow } from "@/components/post/PersonRow";
import { Text } from "@/components/ui/Text";
import { useActiveIdentity } from "@/hooks/usePages";
import { useCategories } from "@/hooks/useCategories";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { usePageSuggestedPeople } from "@/hooks/usePageDiscover";
import { useSuggestedPages, useSuggestedPeople } from "@/hooks/useSearch";
import { haptics } from "@/lib/haptics";
import { RestrictedDiscover } from "./RestrictedDiscover";

// How many suggestions each section shows, and how many topic chips.
const SUGGESTION_LIMIT = 6;
const TOPIC_LIMIT = 16;

function FullDiscover() {
  const { data: categories, refetch: refetchCategories } = useCategories();
  // One flat row of interests across all categories — no accordion.
  const topics = useMemo(() => (categories ?? []).flatMap((c) => c.interests).slice(0, TOPIC_LIMIT), [categories]);
  const { data: identity } = useActiveIdentity();
  const activePageId = identity?.mode === "page" ? identity.page.id : undefined;
  const personalSuggestions = useSuggestedPeople();
  const pageSuggestions = usePageSuggestedPeople(activePageId);
  const { data: suggestedPeople, isLoading: suggestedLoading, refetch: refetchPeople } = activePageId ? pageSuggestions : personalSuggestions;
  const { data: suggestedPages, isLoading: suggestedPagesLoading, refetch: refetchPages } = useSuggestedPages();

  const browse = (
    <>
      {topics.length > 0 ? (
        // Bleeds to the screen edges (negative margin cancels the page padding) so chips scroll off cleanly.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ marginHorizontal: -16 }}
          className="mb-8"
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
      ) : null}

      <View className="mb-9">
        <SectionHeader
          title="People to follow"
          subtitle={activePageId ? "Based on this page's network and activity." : "Based on your network and activity."}
        />
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

      <View>
        <SectionHeader title="Pages to follow" subtitle="Organisations, brands and products worth a look." />
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
    </>
  );

  return (
    <DiscoverShell
      scope="all"
      placeholder="Search Akọ"
      accessibilityLabel="Search people, pages, posts and projects"
      browse={browse}
      // Only the suggestion query in use is refetched; the other one is disabled and refetch() would still hit the network.
      refreshers={[refetchCategories, refetchPeople, refetchPages]}
    />
  );
}

export function Discover() {
  return useIsRestricted() ? <RestrictedDiscover /> : <FullDiscover />;
}
