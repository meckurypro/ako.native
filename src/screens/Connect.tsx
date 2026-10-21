// src/screens/Connect.tsx
// Bottom-nav home for Events, Meetings, Rooms and Affiliates. Replaces the old
// "Events & meetings" / "Affiliates" Activity rows and the Messages tab
// (messages now sit behind the floating chat button).
import { router, type Href } from "expo-router";
import { CalendarClock, Image as ImageIcon, MoreHorizontal, TrendingUp, Users, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
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

export function Connect() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const [tab, setTab] = useTabState<ConnectTab>(TABS, "events");
  const { data: items, isLoading: activityLoading, refetch: refetchActivity } = useActivity();
  const { data: relationships, isLoading: affiliatesLoading, refetch: refetchAffiliates } = useMyAffiliateRelationships();
  const { refreshControl, refreshing } = usePullToRefresh([refetchActivity, refetchAffiliates]);

  const now = Date.now();
  const kindItems = tab === "affiliates" ? [] : (items ?? []).filter((i) => i.kind === KIND_FOR_TAB[tab]);
  const upcoming = kindItems.filter((i) => !i.when || new Date(i.when).getTime() >= now);
  const past = kindItems.filter((i) => i.when && new Date(i.when).getTime() < now);
  const affiliates = relationships ?? [];

  const scrollProps = { ref: onScroll.listRef, refreshControl, onScroll, scrollEventThrottle: 16, showsVerticalScrollIndicator: false, contentContainerStyle: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset, opacity: refreshing ? 0 : 1 } } as const;

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
