// src/screens/Connect.tsx
// Bottom-nav home for Events, Meetings, Rooms and Affiliates. Replaces the old
// "Events & meetings" / "Affiliates" Activity rows and the Messages tab
// (messages now sit behind the floating chat button).
import { router, type Href } from "expo-router";
import { CalendarClock, Image as ImageIcon, TrendingUp, Users } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useActivity, type ActivityItem } from "@/hooks/useActivity";
import { useMyAffiliateRelationships } from "@/hooks/useAffiliates";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useTabState } from "@/hooks/useTabState";
import { haptics } from "@/lib/haptics";
import { AffiliateLinkRow } from "./MyAffiliateLinks";

const TABS = ["events", "meetings", "rooms", "affiliates"] as const;
type ConnectTab = (typeof TABS)[number];

const TAB_LABEL: Record<ConnectTab, string> = { events: "Events", meetings: "Meetings", rooms: "Rooms", affiliates: "Affiliates" };
const KIND_FOR_TAB: Record<Exclude<ConnectTab, "affiliates">, ActivityItem["kind"]> = { events: "event", meetings: "meeting", rooms: "room_meeting" };

const ROUTE_FOR: Record<ActivityItem["kind"], (item: ActivityItem) => string> = {
  event: (item) => `/projects/${item.projectId}/ticket`,
  meeting: (item) => `/meetings/${item.projectId}`,
  room_meeting: (item) => `/rooms/${item.projectId}`,
};
const LABEL_FOR: Record<ActivityItem["kind"], string> = { event: "Event", meeting: "Meeting", room_meeting: "Room meeting" };

const EMPTY_COPY: Record<ConnectTab, string> = {
  events: "Events you have tickets for will show up here.",
  meetings: "Meetings you've joined or bought access to will show up here.",
  rooms: "Room meetings for rooms you're a member of will show up here.",
  affiliates: 'Projects you fork to earn a commission on will show up here — look for "Share & earn" on any project that has affiliate forking turned on.',
};

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <ThumbRow
      onPress={() => router.push(ROUTE_FOR[item.kind](item) as Href)}
      thumbnailUrl={item.thumbnailUrl}
      fallbackIcon={ImageIcon}
      title={item.projectTitle}
      subtitle={`${LABEL_FOR[item.kind]}${item.when ? ` · ${new Date(item.when).toLocaleString()}` : " · Date TBA"}`}
    />
  );
}

export function Connect() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const [tab, setTab] = useTabState<ConnectTab>(TABS, "events");
  const { data: items, isLoading: activityLoading, refetch: refetchActivity } = useActivity();
  const { data: relationships, isLoading: affiliatesLoading, refetch: refetchAffiliates } = useMyAffiliateRelationships();
  const { refreshControl } = usePullToRefresh([refetchActivity, refetchAffiliates]);

  const now = Date.now();
  const kindItems = tab === "affiliates" ? [] : (items ?? []).filter((i) => i.kind === KIND_FOR_TAB[tab]);
  const upcoming = kindItems.filter((i) => !i.when || new Date(i.when).getTime() >= now);
  const past = kindItems.filter((i) => i.when && new Date(i.when).getTime() < now);
  const affiliates = relationships ?? [];

  const scrollProps = { refreshControl, onScroll, scrollEventThrottle: 16, showsVerticalScrollIndicator: false, contentContainerStyle: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset } } as const;

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Connect" back={false} icon={Users} />

      <View accessibilityRole="tablist" className="mx-4 mb-2 flex-row border-b border-border">
        {TABS.map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              if (t === tab) return;
              haptics.selection();
              setTab(t);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            className={`-mb-px flex-1 items-center border-b-2 pb-3 pt-1 ${tab === t ? "border-accent" : "border-transparent"}`}
          >
            <Text numberOfLines={1} className={`text-sm font-medium ${tab === t ? "text-accent" : "text-ink-muted"}`}>
              {TAB_LABEL[t]}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "affiliates" ? (
        affiliatesLoading ? (
          <Text className="px-4 text-sm text-ink-muted">Loading…</Text>
        ) : affiliates.length === 0 ? (
          <EmptyNotice icon={TrendingUp} message={EMPTY_COPY.affiliates} />
        ) : (
          <ScrollView {...scrollProps}>
            {affiliates.map((r) => (
              <AffiliateLinkRow key={r.id} relationship={r} />
            ))}
          </ScrollView>
        )
      ) : activityLoading ? (
        <Text className="px-4 text-sm text-ink-muted">Loading…</Text>
      ) : kindItems.length === 0 ? (
        <EmptyNotice icon={CalendarClock} message={EMPTY_COPY[tab]} />
      ) : (
        <ScrollView {...scrollProps}>
          <View className="mb-6">
            <Text className="mb-2 text-sm font-medium text-ink-muted">Upcoming</Text>
            <View className="gap-2">{upcoming.length === 0 ? <Text className="text-xs text-ink-muted">Nothing upcoming.</Text> : upcoming.map((item, i) => <ActivityRow key={`${item.kind}-${item.projectId}-${i}`} item={item} />)}</View>
          </View>
          <View>
            <Text className="mb-2 text-sm font-medium text-ink-muted">Past</Text>
            <View className="gap-2">{past.length === 0 ? <Text className="text-xs text-ink-muted">Nothing past yet.</Text> : past.map((item, i) => <ActivityRow key={`${item.kind}-${item.projectId}-${i}`} item={item} />)}</View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
