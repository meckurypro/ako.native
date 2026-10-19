// src/components/discover/SearchStart.tsx
// What the search screen shows the moment it opens, before anything is typed —
// the same two blocks TikTok opens with: your recent searches, then what's
// trending. Full accounts see trending hashtags; restricted accounts (no posts,
// so no hashtags) see popular projects instead.
import { router, type Href } from "expo-router";
import { Clock, TrendingUp, X, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import type { SearchScope } from "@/components/post/SearchResults";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useTrendingHashtags, type HashtagSuggestion } from "@/hooks/useDiscoverSearch";
import { PROJECT_TYPE_LABELS, type Project } from "@/hooks/useProjects";
import { useSuggestedProjects } from "@/hooks/useSearch";
import { haptics } from "@/lib/haptics";

const RECENT_COLLAPSED = 5;
const TRENDING_LIMIT = 6;

function SectionLabel({ label, icon, action }: { label: string; icon?: LucideIcon; action?: ReactNode }) {
  return (
    <View className="mb-1 flex-row items-center justify-between">
      <View className="flex-row items-center gap-1.5">
        {icon ? <Icon as={icon} size={12} className="text-ink-muted" /> : null}
        <Text className="text-[11px] font-medium uppercase tracking-[1.54px] text-ink-muted">{label}</Text>
      </View>
      {action}
    </View>
  );
}

function Recent({
  items,
  onPick,
  onRemove,
  onClear,
}: {
  items: string[];
  onPick: (term: string) => void;
  onRemove: (term: string) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, RECENT_COLLAPSED);

  return (
    <View className="mb-7">
      <SectionLabel
        label="Recent"
        action={
          <Pressable onPress={onClear} accessibilityRole="button" hitSlop={10}>
            <Text className="text-xs font-medium text-ink-muted">Clear all</Text>
          </Pressable>
        }
      />
      {visible.map((term) => (
        <View key={term} className="min-h-[48px] flex-row items-center gap-3">
          <Pressable onPress={() => onPick(term)} accessibilityRole="button" className="min-w-0 flex-1 flex-row items-center gap-3 py-3 active:opacity-60">
            <Icon as={Clock} size={16} className="shrink-0 text-ink-muted" />
            <Text numberOfLines={1} className="shrink text-sm text-ink">
              {term}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onRemove(term)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${term} from recent searches`}
            hitSlop={8}
            className="-mr-3 shrink-0 p-3"
          >
            <Icon as={X} size={15} className="text-ink-muted" />
          </Pressable>
        </View>
      ))}
      {items.length > RECENT_COLLAPSED ? (
        <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" className="py-2">
          <Text className="text-sm font-medium text-ink-muted">{expanded ? "Show less" : "Show more"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Rank({ n }: { n: number }) {
  return <Text className="w-4 shrink-0 text-xs text-ink-muted">{n}</Text>;
}

function TrendingHashtags({ tags }: { tags: HashtagSuggestion[] }) {
  return (
    <View>
      {tags.map((h, i) => (
        <Pressable
          key={h.id}
          onPress={() => {
            haptics.selection();
            router.push(`/hashtag/${encodeURIComponent(h.tag)}` as Href);
          }}
          accessibilityRole="link"
          className="min-h-[48px] flex-row items-center gap-3 py-3 active:opacity-60"
        >
          <Rank n={i + 1} />
          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
            #{h.tag}
          </Text>
          <Text className="shrink-0 text-xs text-ink-muted">
            {h.usage_count.toLocaleString()} {h.usage_count === 1 ? "post" : "posts"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function TrendingProjects({ projects, onPick }: { projects: Project[]; onPick: (term: string) => void }) {
  return (
    <View>
      {projects.map((p, i) => (
        <Pressable key={p.id} onPress={() => onPick(p.title)} accessibilityRole="button" className="min-h-[48px] flex-row items-center gap-3 py-3 active:opacity-60">
          <Rank n={i + 1} />
          <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
            {p.title}
          </Text>
          <Text className="shrink-0 text-xs text-ink-muted">{PROJECT_TYPE_LABELS[p.project_type]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SearchStart({
  scope,
  recents,
  onPick,
  onRemoveRecent,
  onClearRecents,
}: {
  scope: SearchScope;
  recents: string[];
  onPick: (term: string) => void;
  onRemoveRecent: (term: string) => void;
  onClearRecents: () => void;
}) {
  const tags = useTrendingHashtags(scope === "all");
  const projects = useSuggestedProjects(scope === "discover");
  const tagRows = scope === "all" ? tags.data ?? [] : [];
  const projectRows = scope === "discover" ? (projects.data ?? []).slice(0, TRENDING_LIMIT) : [];
  const hasTrending = tagRows.length > 0 || projectRows.length > 0;
  const loading = scope === "all" ? tags.isLoading : projects.isLoading;

  return (
    <Animated.View entering={FadeIn.duration(200)} className="pt-2">
      <Recent items={recents} onPick={onPick} onRemove={onRemoveRecent} onClear={onClearRecents} />

      {hasTrending ? (
        <View>
          <SectionLabel label="Trending" icon={TrendingUp} />
          {scope === "all" ? <TrendingHashtags tags={tagRows} /> : <TrendingProjects projects={projectRows} onPick={onPick} />}
        </View>
      ) : null}

      {!hasTrending && !loading && recents.length === 0 ? (
        <Text className="px-6 py-14 text-center text-sm text-ink-muted">
          {scope === "all" ? "Search for people, pages, posts or projects." : "Search for pages and projects."}
        </Text>
      ) : null}
    </Animated.View>
  );
}
