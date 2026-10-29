// src/screens/RestrictedDiscover.tsx
// Discover for restricted (consumer-only) accounts: the same structured page as everyone else — a
// swipeable row per kind of content, then Pages — minus the people section. Never people or posts.
// Same TikTok-style search as full accounts (see DiscoverShell), scoped down.
import { Link, type Href } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { View } from "react-native";

import { DiscoverBrowse } from "@/components/discover/DiscoverBrowse";
import { DiscoverShell } from "@/components/discover/DiscoverShell";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { closestPathway, useMyFeedAccess } from "@/hooks/useFeedAccess";
import { useSuggestedPages } from "@/hooks/useSearch";

// Progressive Access entry point: the pathway this account is closest to finishing. Renders nothing
// until progress is known, or when automatic unlocking is paused / held by an admin.
function FeedAccessCard() {
  const { data } = useMyFeedAccess();
  if (!data || data.has_feed_access || !data.progressive_enabled || data.auto_unlock_blocked) return null;
  const next = closestPathway(data.rules);
  if (!next) return null;
  const pct = Math.round(next.progress * 100);
  return (
    <Link href={"/feed-access" as Href} asChild>
      <View className="mb-7 rounded-2xl border border-border bg-surface p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-medium text-ink">Unlock the Feed</Text>
          <Icon as={ArrowRight} size={16} className="text-ink-muted" />
        </View>
        <Text className="mt-0.5 text-sm text-ink-muted">
          {pct > 0 ? `${next.name} — ${pct}% there` : "Choose a path that fits why you're here"}
        </Text>
        <View className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border">
          <View className="h-full rounded-full bg-brand-orange" style={{ width: `${pct}%` }} />
        </View>
      </View>
    </Link>
  );
}

export function RestrictedDiscover() {
  const { refetch: refetchPages } = useSuggestedPages();
  // The type rows are queries on screen too: pull-to-refresh refetches every query currently on screen
  // (see usePullToRefresh), so only the page suggestions need listing explicitly.

  return (
    <DiscoverShell
      scope="discover"
      placeholder="Search pages and projects"
      accessibilityLabel="Search pages and projects"
      browse={<DiscoverBrowse lead={<FeedAccessCard />} />}
      refreshers={[refetchPages]}
    />
  );
}
