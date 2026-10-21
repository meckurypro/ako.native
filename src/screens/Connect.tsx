// src/screens/Connect.tsx
// Bottom-nav home for Events, Meetings, Rooms and Affiliates. Replaces the old
// "Events & meetings" / "Affiliates" Activity rows and the Messages tab
// (messages now sit behind the floating chat button).
import { router, type Href } from "expo-router";
import { CalendarClock, Image as ImageIcon, MoreHorizontal, TrendingUp, Users, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { useSharedValue } from "react-native-reanimated";
import { Pressable, ScrollView, View } from "react-native";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SlidingTabBar } from "@/components/ui/SlidingTabBar";
import { SwipeableTabs } from "@/components/ui/SwipeableTabs";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useActivity, type ActivityItem } from "@/hooks/useActivity";
import { useMyAffiliateRelationships } from "@/hooks/useAffiliates";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useRemoveFromLibrary } from "@/hooks/useLibraryRemovals";
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
  const toast = useToast();
  const online = useIsOnline();
  const removeFromConnect = useRemoveFromLibrary();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuRef = useRef<View>(null);

  async function removeNow() {
    if (!online) {
      toast("Connect to the internet to remove this.", { variant: "error" });
      return;
    }
    try {
      await removeFromConnect.mutateAsync(item.projectId);
      toast("Removed from Connect");
    } catch {
      toast("Couldn't remove it. Try again.", { variant: "error" });
    }
  }

  return (
    <View>
    <ThumbRow
      onPress={() => router.push(ROUTE_FOR[item.kind](item) as Href)}
      thumbnailUrl={item.thumbnailUrl}
      fallbackIcon={ImageIcon}
      title={item.projectTitle}
      subtitle={`${LABEL_FOR[item.kind]}${item.when ? ` · ${new Date(item.when).toLocaleString()}` : " · Date TBA"}`}
      trailing={
        <Pressable ref={menuRef} onPress={() => setMenuOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Options for ${item.projectTitle}`} className="p-1">
          <Icon as={MoreHorizontal} size={20} className="text-ink-muted" />
        </Pressable>
      }
    />
    {menuOpen ? (
      <DropdownMenu title="Options"
        anchorRef={menuRef}
        onClose={() => setMenuOpen(false)}
        width={224}
        items={[{ key: "remove", label: "Remove from Connect", icon: <Icon as={X} size={22} className="text-overlay-ink" />, onSelect: () => setConfirming(true) }]}
      />
    ) : null}
    {confirming ? (
      <ConfirmDialog
        themed
        danger={false}
        title="Remove from Connect?"
        description="This only takes it off this list. Your access doesn't change."
        confirmLabel="Remove"
        onConfirm={() => {
          setConfirming(false);
          void removeNow();
        }}
        onCancel={() => setConfirming(false)}
      />
    ) : null}
    </View>
  );
}

interface ConnectPaneProps {
  tab: ConnectTab;
  items: ActivityItem[] | undefined;
  activityLoading: boolean;
  affiliatesLoading: boolean;
  relationships: ReturnType<typeof useMyAffiliateRelationships>["data"];
  refetch: (() => Promise<unknown>)[];
}

// One pane per tab, each with its own scroll list (see SwipeableTabs) so every tab keeps its own scroll position.
function ConnectPane({ tab, items, activityLoading, affiliatesLoading, relationships, refetch }: ConnectPaneProps) {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { refreshControl, refreshing } = usePullToRefresh(refetch);

  const now = Date.now();
  const kindItems = tab === "affiliates" ? [] : (items ?? []).filter((i) => i.kind === KIND_FOR_TAB[tab]);
  const upcoming = kindItems.filter((i) => !i.when || new Date(i.when).getTime() >= now);
  const past = kindItems.filter((i) => i.when && new Date(i.when).getTime() < now);
  const affiliates = relationships ?? [];

  const scrollProps = { ref: onScroll.listRef, refreshControl, onScroll, scrollEventThrottle: 16, showsVerticalScrollIndicator: false, contentContainerStyle: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset, opacity: refreshing ? 0 : 1 } } as const;

  if (tab === "affiliates") {
    if (affiliatesLoading) return <Text className="px-4 text-sm text-ink-muted">Loading…</Text>;
    if (affiliates.length === 0) return <EmptyNotice icon={TrendingUp} message={EMPTY_COPY.affiliates} />;
    return (
      <ScrollView {...scrollProps}>
        {affiliates.map((r) => (
          <AffiliateLinkRow key={r.id} relationship={r} />
        ))}
      </ScrollView>
    );
  }
  if (activityLoading) return <Text className="px-4 text-sm text-ink-muted">Loading…</Text>;
  if (kindItems.length === 0) return <EmptyNotice icon={CalendarClock} message={EMPTY_COPY[tab]} />;
  return (
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
  );
}

export function Connect() {
  const [tab, setTab] = useTabState<ConnectTab>(TABS, "events");
  const activeIndex = Math.max(TABS.indexOf(tab), 0);
  const progress = useSharedValue(activeIndex);
  const { data: items, isLoading: activityLoading, refetch: refetchActivity } = useActivity();
  const { data: relationships, isLoading: affiliatesLoading, refetch: refetchAffiliates } = useMyAffiliateRelationships();

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Connect" back={false} icon={Users} iconClassName="text-brand-orange" titleClassName="text-[28px] font-bold leading-tight tracking-tight text-ink" />

      <SlidingTabBar
        className="mx-4 mb-2"
        tabs={TABS.map((t) => ({ id: t, label: TAB_LABEL[t] }))}
        activeIndex={activeIndex}
        progress={progress}
        onSelect={(i) => setTab(TABS[i])}
      />

      {/* Swipe left/right to change tab — same carousel as Feed. */}
      <SwipeableTabs
        index={activeIndex}
        progress={progress}
        onIndexChange={(i) => {
          haptics.selection();
          setTab(TABS[i]);
        }}
      >
        {TABS.map((t) => (
          <ConnectPane key={t} tab={t} items={items} activityLoading={activityLoading} affiliatesLoading={affiliatesLoading} relationships={relationships} refetch={[refetchActivity, refetchAffiliates]} />
        ))}
      </SwipeableTabs>
    </View>
  );
}
