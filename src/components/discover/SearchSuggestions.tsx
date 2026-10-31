// src/components/discover/SearchSuggestions.tsx
// The live list under the search bar while you type — TikTok's "keep typing,
// we'll finish it for you" moment. Top row is always what you've typed (tap =
// search it). Below: matching hashtags, accounts you can open straight away,
// and project titles that complete your text. Everything comes from the same
// hooks the results use, so submitting a suggestion's text is an instant cache
// hit, not a second round-trip.
import { router, type Href } from "expo-router";
import { ArrowUpLeft, Hash, Search, Tag } from "lucide-react-native";
import { Pressable, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import type { SearchScope } from "@/components/post/SearchResults";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useAuth } from "@/hooks/useAuth";
import { useHashtagSuggestions } from "@/hooks/useDiscoverSearch";
import { PROJECT_TYPE_LABELS } from "@/hooks/useProjects";
import { useSearchPages, useSearchPeople, useSearchProjects } from "@/hooks/useSearch";
import { useTagSearch, type TagRef } from "@/hooks/useTags";
import { haptics } from "@/lib/haptics";
import { splitMatch } from "@/lib/highlightMatch";
import { recordSearchVisit } from "@/lib/searchVisits";

const MAX_TAGS = 2;
const MAX_TOPICS = 2;
const MAX_ACCOUNTS = 3;
const MAX_PROJECTS = 3;

/** Typed part regular, the rest medium — the completion reads as the suggestion. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const parts = splitMatch(text, query);
  if (!parts) return <Text className="font-medium">{text}</Text>;
  return (
    <>
      <Text className="font-medium">{parts.before}</Text>
      <Text>{parts.match}</Text>
      <Text className="font-medium">{parts.after}</Text>
    </>
  );
}

function Skeleton() {
  return (
    <View className="gap-1 pt-1" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1].map((i) => (
        <View key={i} className="min-h-[48px] flex-row items-center gap-3">
          <View className="h-8 w-8 rounded-full bg-surface" />
          <View className="h-3 w-1/2 rounded bg-surface" />
        </View>
      ))}
    </View>
  );
}

export function SearchSuggestions({
  query,
  typed,
  scope,
  onSubmit,
  onFill,
  onPickTag,
}: {
  /** Debounced, trimmed text — drives the lookups. */
  query: string;
  /** What's in the bar right now — shown instantly as the top row. */
  typed: string;
  scope: SearchScope;
  /** Run a search for this text. */
  onSubmit: (term: string) => void;
  /** Put this text in the bar without searching (the ↖ arrow). */
  onFill: (term: string) => void;
  /** Use this topic as a filter for the page's contents (instead of searching its name as text). */
  onPickTag?: (tag: TagRef) => void;
}) {
  const { user } = useAuth();
  const withPeopleAndTags = scope === "all";

  const tags = useHashtagSuggestions(query, withPeopleAndTags);
  const topics = useTagSearch(onPickTag ? query.replace(/^#/, "") : "");
  const people = useSearchPeople(withPeopleAndTags ? query : "");
  const pages = useSearchPages(query);
  const projects = useSearchProjects(query);

  const tagRows = (tags.data ?? []).slice(0, MAX_TAGS);
  const topicRows = onPickTag ? (topics.data ?? []).slice(0, MAX_TOPICS) : [];
  const personRows = withPeopleAndTags ? (people.data ?? []).slice(0, 2) : [];
  const pageRows = (pages.data ?? []).slice(0, MAX_ACCOUNTS - personRows.length);
  const projectRows = (projects.data ?? []).slice(0, MAX_PROJECTS);

  const hasRows = topicRows.length + tagRows.length + personRows.length + pageRows.length + projectRows.length > 0;
  const loading = tags.isLoading || people.isLoading || pages.isLoading || projects.isLoading;

  const open = (href: string) => {
    haptics.selection();
    router.push(href as Href);
  };

  return (
    <Animated.View entering={FadeIn.duration(180)} className="pt-1">
      {/* What you typed — always first, always one tap from results. */}
      <Pressable onPress={() => onSubmit(typed)} accessibilityRole="button" className="min-h-[48px] flex-row items-center gap-3 py-3 active:opacity-60">
        <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
        <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
          {typed.trim()}
        </Text>
      </Pressable>

      {topicRows.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => {
            haptics.selection();
            onPickTag?.(t);
          }}
          accessibilityRole="button"
          className="min-h-[48px] flex-row items-center gap-3 py-2 active:opacity-60"
        >
          <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface">
            <Icon as={Tag} size={15} className="text-accent" />
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm text-ink">
              <Highlighted text={t.name} query={query.replace(/^#/, "")} />
            </Text>
            <Text className="text-xs text-ink-muted">Topic · filter by this</Text>
          </View>
        </Pressable>
      ))}

      {tagRows.map((h) => (
        <Pressable
          key={h.id}
          onPress={() => open(`/hashtag/${encodeURIComponent(h.tag)}`)}
          accessibilityRole="link"
          className="min-h-[48px] flex-row items-center gap-3 py-2 active:opacity-60"
        >
          <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface">
            <Icon as={Hash} size={15} className="text-ink-muted" />
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm text-ink">
              #<Highlighted text={h.tag} query={query.replace(/^#/, "")} />
            </Text>
            <Text className="text-xs text-ink-muted">
              {h.usage_count.toLocaleString()} {h.usage_count === 1 ? "post" : "posts"}
            </Text>
          </View>
        </Pressable>
      ))}

      {personRows.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => {
            recordSearchVisit(user?.id, p.id);
            open(`/profile/${p.username}`);
          }}
          accessibilityRole="link"
          className="min-h-[48px] flex-row items-center gap-3 py-2 active:opacity-60"
        >
          <Avatar src={p.avatar_url} name={p.display_name} size="sm" />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm text-ink">
              {p.display_name}
            </Text>
            <Text numberOfLines={1} className="text-xs text-ink-muted">
              @{p.username}
            </Text>
          </View>
        </Pressable>
      ))}

      {pageRows.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => open(`/page/${p.username}`)}
          accessibilityRole="link"
          className="min-h-[48px] flex-row items-center gap-3 py-2 active:opacity-60"
        >
          <Avatar src={p.avatar_url} name={p.name} size="sm" />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text numberOfLines={1} className="shrink text-sm text-ink">
                {p.name}
              </Text>
              {p.is_verified ? <VerifiedBadge className="shrink-0" /> : null}
            </View>
            <Text numberOfLines={1} className="text-xs text-ink-muted">
              @{p.username}
            </Text>
          </View>
        </Pressable>
      ))}

      {projectRows.map((p) => (
        <View key={p.id} className="min-h-[48px] flex-row items-center gap-3">
          <Pressable onPress={() => onSubmit(p.title)} accessibilityRole="button" className="min-w-0 flex-1 flex-row items-center gap-3 py-3 active:opacity-60">
            <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
            <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
              <Highlighted text={p.title} query={query} />
            </Text>
            <Text className="shrink-0 text-xs text-ink-muted">{PROJECT_TYPE_LABELS[p.project_type]}</Text>
          </Pressable>
          <Pressable
            onPress={() => onFill(p.title)}
            accessibilityRole="button"
            accessibilityLabel={`Use “${p.title}” as your search`}
            hitSlop={8}
            className="-mr-3 shrink-0 p-3"
          >
            <Icon as={ArrowUpLeft} size={16} className="text-ink-muted" />
          </Pressable>
        </View>
      ))}

      {!hasRows && loading ? <Skeleton /> : null}
    </Animated.View>
  );
}
