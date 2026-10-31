// src/screens/Discover.tsx
// Discover for full accounts: a TikTok-style search (see DiscoverShell) over the structured browse page.
// Full accounts get a lead on top — topic chips (ONE scrolling row) and People to follow — and then the same
// swipeable row per kind of content, and Pages, that restricted accounts get (see DiscoverBrowse).
//
// The chips come from the database, not a fixed list: the viewer's own interests first (the ones chosen at
// onboarding / in Settings), then topics connected to those, then what's popular. Tapping a chip filters this
// page in place — projects, groups, talents, pages and people — it never leaves Discover.
import { router } from "expo-router";
import { Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView } from "react-native";

import { DiscoverBrowse } from "@/components/discover/DiscoverBrowse";
import { DiscoverAvatarTile, AVATAR_TILE_WIDTH, DiscoverRail } from "@/components/discover/DiscoverRail";
import { DiscoverShell } from "@/components/discover/DiscoverShell";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useActiveIdentity } from "@/hooks/usePages";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { usePageSuggestedPeople } from "@/hooks/usePageDiscover";
import { useSuggestedPages, useSuggestedPeople } from "@/hooks/useSearch";
import { useSuggestedTags, useTagPeople, type TagRef } from "@/hooks/useTags";
import { haptics } from "@/lib/haptics";
import { RestrictedDiscover } from "./RestrictedDiscover";

// How many topic chips and people the lead section shows (search is the way to find more).
const TOPIC_LIMIT = 16;
const PEOPLE_LIMIT = 10;
const MAX_SELECTED = 5;

function FullDiscover() {
  const [tags, setTags] = useState<TagRef[]>([]);
  const tagIds = tags.map((t) => t.id);
  const active = tags.length > 0;

  const addTag = (tag: TagRef) => setTags((cur) => (cur.some((t) => t.id === tag.id) ? cur : [...cur, { id: tag.id, name: tag.name, slug: tag.slug }].slice(-MAX_SELECTED)));
  const removeTag = (slug: string) => setTags((cur) => cur.filter((t) => t.slug !== slug));
  const toggleTag = (tag: TagRef) => (tags.some((t) => t.id === tag.id) ? removeTag(tag.slug) : addTag(tag));

  const { data: suggestedTags, refetch: refetchTags } = useSuggestedTags(TOPIC_LIMIT);
  const { data: identity } = useActiveIdentity();
  const activePageId = identity?.mode === "page" ? identity.page.id : undefined;
  const personalSuggestions = useSuggestedPeople();
  const pageSuggestions = usePageSuggestedPeople(activePageId);
  const { data: suggestedPeople, refetch: refetchPeople } = activePageId ? pageSuggestions : personalSuggestions;
  const { refetch: refetchPages } = useSuggestedPages();
  const taggedPeople = useTagPeople(tagIds, PEOPLE_LIMIT);

  const selectedIds = new Set(tagIds);
  // Selected topics lead (even ones that came from search and aren't in the suggestions), then the rest.
  const chips: Array<TagRef & { mine: boolean }> = [
    ...tags.map((t) => ({ ...t, mine: false })),
    ...(suggestedTags ?? []).filter((t) => !selectedIds.has(t.id)).map((t) => ({ id: t.id, name: t.name, slug: t.slug, mine: t.reason === "mine" })),
  ];

  const people = active ? taggedPeople.data ?? [] : (suggestedPeople ?? []).slice(0, PEOPLE_LIMIT);
  const peopleTitle = active ? `People into ${tags.map((t) => t.name).join(", ")}` : "People to follow";

  const lead = (
    <>
      {/* Bleeds to the screen edges (negative margin cancels the page padding) so chips scroll off cleanly. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ marginHorizontal: -16 }}
        className="mb-7"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}
      >
        {active ? (
          <Pressable
            onPress={() => {
              haptics.selection();
              setTags([]);
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear topic filters"
            className="flex-row items-center gap-1 rounded-full border border-border bg-surface px-3 py-2 active:opacity-70"
          >
            <Icon as={X} size={14} className="text-ink-muted" />
            <Text className="text-sm text-ink-muted">Clear</Text>
          </Pressable>
        ) : null}

        {chips.map((chip) => {
          const on = selectedIds.has(chip.id);
          return (
            <Pressable
              key={chip.id}
              onPress={() => {
                haptics.selection();
                toggleTag(chip);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              className={`rounded-full border px-3.5 py-2 ${
                on ? "border-cta bg-cta" : chip.mine ? "border-accent-a40 bg-surface active:border-accent" : "border-border bg-surface active:border-accent-a50"
              }`}
            >
              <Text className={`text-sm ${on ? "text-white" : "text-ink"}`}>{chip.name}</Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => {
            haptics.selection();
            router.push({ pathname: "/settings", params: { section: "interests" } });
          }}
          accessibilityRole="button"
          accessibilityLabel="Edit your interests"
          className="flex-row items-center gap-1 rounded-full border border-dashed border-accent-a40 px-3 py-2 active:opacity-70"
        >
          <Icon as={Plus} size={14} className="text-accent" />
          <Text className="text-sm text-accent">Interests</Text>
        </Pressable>
      </ScrollView>

      {people.length > 0 ? (
        <DiscoverRail title={peopleTitle} snap={AVATAR_TILE_WIDTH + 12}>
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
      tags={tags}
      onRemoveTag={removeTag}
      onPickTag={addTag}
      browse={<DiscoverBrowse tags={tags} onPickTag={addTag} lead={lead} />}
      // Only the suggestion query in use is refetched; the other one is disabled and refetch() would still hit the network.
      refreshers={[refetchTags, refetchPeople, refetchPages]}
    />
  );
}

export function Discover() {
  return useIsRestricted() ? <RestrictedDiscover /> : <FullDiscover />;
}
