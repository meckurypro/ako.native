// src/screens/Activity.tsx
// The Activity hub: one row per personal log (saved, liked, drafts, scheduled, history).
import { router, type Href } from "expo-router";
import { Bookmark, ChevronRight, FileEdit, GitFork, Heart, History, Send, Tag, type LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useMyAffiliateRelationships } from "@/hooks/useAffiliates";
import { useMyDraftPosts, useMyScheduledPosts } from "@/hooks/usePosts";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

interface ActivityRow {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
  countFrom?: "drafts" | "scheduled";
  /** Only listed once the user has forked a project. */
  forkedOnly?: boolean;
}

const ROWS: ActivityRow[] = [
  { to: "/activity/saved", icon: Bookmark, label: "Saved", description: "Posts and projects you've bookmarked" },
  { to: "/activity/liked", icon: Heart, label: "Liked", description: "Posts and projects you've liked" },
  { to: "/activity/drafts", icon: FileEdit, label: "Drafts", description: "Posts you started but haven't shared yet", countFrom: "drafts" },
  { to: "/activity/scheduled", icon: Send, label: "Scheduled", description: "Posts queued to publish automatically", countFrom: "scheduled" },
  { to: "/activity/offers", icon: Tag, label: "Offers", description: "Bundle your paid projects at a special price" },
  { to: "/wallet/affiliate-links", icon: GitFork, label: "Forked projects", description: "Projects you forked, with your affiliate links", forkedOnly: true },
  { to: "/activity/history", icon: History, label: "History", description: "Posts and projects you've viewed" },
];

export function Activity() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { data: drafts, refetch: refetchDrafts } = useMyDraftPosts();
  const { data: scheduled, refetch: refetchScheduled } = useMyScheduledPosts();
  const { data: forks, refetch: refetchForks } = useMyAffiliateRelationships();
  const hasForks = (forks ?? []).some((r) => !!r.project);
  const { refreshControl, refreshing } = usePullToRefresh([refetchDrafts, refetchScheduled, refetchForks]);

  // Only drafts/scheduled get a badge: they're the rows with a pending action behind them.
  const countFor = (from: ActivityRow["countFrom"]) => (from === "drafts" ? (drafts?.length ?? 0) : from === "scheduled" ? (scheduled?.length ?? 0) : 0);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Activity" />
      <ScrollView showsHorizontalScrollIndicator={false} ref={onScroll.listRef} refreshControl={refreshControl} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset, opacity: refreshing ? 0 : 1 }}>
        {ROWS.filter((row) => !row.forkedOnly || hasForks).map(({ to, icon, label, description, countFrom }) => {
          const count = countFor(countFrom);
          return (
            <Pressable
              key={to}
              onPress={() => router.push(to as Href)}
              accessibilityRole="link"
              accessibilityLabel={count > 0 ? `${label}, ${count}` : label}
              className="flex-row items-center gap-3 border-b border-border py-3.5"
            >
              <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                <Icon as={icon} size={18} className="text-accent" />
              </View>
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-medium text-ink">{label}</Text>
                  {count > 0 && (
                    <View className="h-[18px] min-w-[18px] items-center justify-center rounded-full bg-cta px-1">
                      <Text className="text-[10px] font-semibold text-white">{count}</Text>
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} className="text-xs text-ink-muted">
                  {description}
                </Text>
              </View>
              <Icon as={ChevronRight} size={18} className="text-ink-muted" />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
