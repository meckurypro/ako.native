// src/screens/Discover.tsx
// Discover for full accounts: a TikTok-style search (see DiscoverShell) over the structured browse page.
// Full accounts get a lead on top — topic chips (ONE scrolling row; tapping one filters the feed by it)
// and People to follow — and then the same swipeable row per kind of content, and Pages, that restricted
// accounts get (see DiscoverBrowse).
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView } from "react-native";

import { DiscoverBrowse } from "@/components/discover/DiscoverBrowse";
import { DiscoverAvatarTile, AVATAR_TILE_WIDTH, DiscoverRail } from "@/components/discover/DiscoverRail";
import { DiscoverShell } from "@/components/discover/DiscoverShell";
import { Text } from "@/components/ui/Text";
import { useActiveIdentity } from "@/hooks/usePages";
import { useCategories } from "@/hooks/useCategories";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { usePageSuggestedPeople } from "@/hooks/usePageDiscover";
import { useSuggestedPages, useSuggestedPeople } from "@/hooks/useSearch";
import { haptics } from "@/lib/haptics";
import { RestrictedDiscover } from "./RestrictedDiscover";

// How many topic chips and people the lead section shows (search is the way to find more).
const TOPIC_LIMIT = 16;
const PEOPLE_LIMIT = 10;

function FullDiscover() {
  const { data: categories, refetch: refetchCategories } = useCategories();
  // One flat row of interests across all categories — no accordion.
  const topics = useMemo(() => (categories ?? []).flatMap((c) => c.interests).slice(0, TOPIC_LIMIT), [categories]);
  const { data: identity } = useActiveIdentity();
  const activePageId = identity?.mode === "page" ? identity.page.id : undefined;
  const personalSuggestions = useSuggestedPeople();
  const pageSuggestions = usePageSuggestedPeople(activePageId);
  const { data: suggestedPeople, refetch: refetchPeople } = activePageId ? pageSuggestions : personalSuggestions;
  const { refetch: refetchPages } = useSuggestedPages();
  const people = (suggestedPeople ?? []).slice(0, PEOPLE_LIMIT);

  const lead = (
    <>
      {topics.length > 0 ? (
        // Bleeds to the screen edges (negative margin cancels the page padding) so chips scroll off cleanly.
        <ScrollView
          showsVerticalScrollIndicator={false}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ marginHorizontal: -16 }}
          className="mb-7"
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

      {people.length > 0 ? (
        <DiscoverRail title="People to follow" snap={AVATAR_TILE_WIDTH + 12}>
          {people.map((p) => (
            <DiscoverAvatarTile key={p.id} to={`/profile/${p.username}`} name={p.display_name} avatarUrl={p.avatar_url} caption={`@${p.username}`} />
          ))}
        </DiscoverRail>
      ) : null}
    </>
  );

  return (
    <DiscoverShell
      scope="all"
      placeholder="Search Akọ"
      accessibilityLabel="Search people, pages, posts and projects"
      browse={<DiscoverBrowse lead={lead} />}
      // Only the suggestion query in use is refetched; the other one is disabled and refetch() would still hit the network.
      refreshers={[refetchCategories, refetchPeople, refetchPages]}
    />
  );
}

export function Discover() {
  return useIsRestricted() ? <RestrictedDiscover /> : <FullDiscover />;
}
