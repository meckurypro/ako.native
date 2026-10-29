// src/screens/Connect.tsx
// Bottom-nav home for Events, Meetings and Groups (communities and cohorts). Replaces the old
// "Events & meetings" Activity row and the Messages tab (messages now sit
// behind the floating chat button). Forked (affiliate) projects live under Wallet.
//
// Tabs are dynamic: a tab only appears once the user has something in it, and
// with nothing at all the screen shows a single empty state instead of a tab bar.
import { router, type Href } from "expo-router";
import { CalendarClock, Image as ImageIcon, MoreHorizontal, Plus, Users, X } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
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
import { formatCountdown, useCountdown } from "@/hooks/useCountdown";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useRemoveFromLibrary } from "@/hooks/useLibraryRemovals";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useTabState } from "@/hooks/useTabState";
import { haptics } from "@/lib/haptics";

const ALL_TABS = ["events", "meetings", "groups"] as const;
type ConnectTab = (typeof ALL_TABS)[number];

const TAB_LABEL: Record<ConnectTab, string> = { events: "Events", meetings: "Meetings", groups: "Groups" };
// Group meetings sit with the other meetings (group name + a countdown); the Groups tab lists the groups themselves.
const KINDS_FOR_TAB: Record<ConnectTab, ActivityItem["kind"][]> = { events: ["event"], meetings: ["meeting", "room_meeting"], groups: ["room"] };

const ROUTE_FOR: Record<ActivityItem["kind"], (item: ActivityItem) => string> = {
  event: (item) => `/projects/${item.projectId}/ticket`,
  meeting: (item) => `/meetings/${item.projectId}`,
  room_meeting: (item) => `/groups/${item.projectId}`,
  room: (item) => `/groups/${item.projectId}`,
};
const LABEL_FOR: Record<ActivityItem["kind"], string> = { event: "Event", meeting: "Meeting", room_meeting: "Group meeting", room: "Group" };

function ActivityRow({ item }: { item: ActivityItem }) {
  const toast = useToast();
  const online = useIsOnline();
  const removeFromConnect = useRemoveFromLibrary();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuRef = useRef<View>(null);
  // Live countdown for a meeting that hasn't started; "Live now" for a room meeting that is running.
  const remaining = useCountdown(item.kind === "meeting" || item.kind === "room_meeting" ? item.when : null);
  const countdown = remaining !== null && remaining > 0 ? `Starts in ${formatCountdown(remaining)}` : item.kind === "room_meeting" && item.meetingStatus === "live" ? "Live now" : null;
  const when = item.kind === "room" ? "" : item.when ? ` · ${new Date(item.when).toLocaleString()}` : " · Date TBA";
  const subtitle = [`${LABEL_FOR[item.kind]}${when}`, item.kind === "room_meeting" ? item.meetingTitle : null, countdown].filter(Boolean).join(" · ");

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
      subtitle={subtitle}
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
  items: ActivityItem[];
  refetch: (() => Promise<unknown>)[];
}

// One pane per tab, each with its own scroll list (see SwipeableTabs) so every tab keeps its own scroll position.
function ConnectPane({ tab, items, refetch }: ConnectPaneProps) {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { refreshControl, refreshing } = usePullToRefresh(refetch);

  const now = Date.now();
  const kindItems = items.filter((i) => KINDS_FOR_TAB[tab].includes(i.kind));
  // A room meeting that is live right now still counts as upcoming, so it stays on top with "Live now".
  const isLive = (i: ActivityItem) => i.kind === "room_meeting" && i.meetingStatus === "live";
  const upcoming = kindItems.filter((i) => !i.when || new Date(i.when).getTime() >= now || isLive(i));
  const past = kindItems.filter((i) => i.when && new Date(i.when).getTime() < now && !isLive(i));

  const scrollProps = { ref: onScroll.listRef, refreshControl, onScroll, scrollEventThrottle: 16, showsVerticalScrollIndicator: false, contentContainerStyle: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset, opacity: refreshing ? 0 : 1 } } as const;

  // The Groups tab lists the groups themselves, with nothing to split into upcoming/past.
  if (tab === "groups") {
    return (
      <ScrollView {...scrollProps}>
        <View className="gap-2">{kindItems.map((item) => <ActivityRow key={`${item.kind}-${item.projectId}`} item={item} />)}</View>
      </ScrollView>
    );
  }

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
  const { data, isLoading, refetch } = useActivity();
  const items = useMemo(() => data ?? [], [data]);
  // Groups are created from here; the creation form is the project form in group mode, so it shares its kill switch.
  const canCreateGroup = useFeatureFlag("projects_enabled");

  // Only tabs that have something in them are shown.
  const tabs = useMemo(() => ALL_TABS.filter((t) => items.some((i) => KINDS_FOR_TAB[t].includes(i.kind))), [items]);
  const [tab, setTab] = useTabState<ConnectTab>(ALL_TABS, tabs[0] ?? "events");
  // If the selected tab disappears (e.g. its last item was removed), fall back to the first one left.
  const activeIndex = Math.max(tabs.indexOf(tab), 0);
  const progress = useSharedValue(activeIndex);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        title="Connect"
        back={false}
        icon={Users}
        iconClassName="text-brand-orange"
        titleClassName="text-[28px] font-bold leading-tight tracking-tight text-ink"
        right={
          canCreateGroup ? (
            <Pressable onPress={() => router.push("/groups/new" as Href)} accessibilityRole="button" accessibilityLabel="New group" className="mr-4 flex-row items-center gap-1 rounded-full bg-cta px-3.5 py-2">
              <Icon as={Plus} size={16} className="text-white" />
              <Text className="text-sm font-medium text-white">New group</Text>
            </Pressable>
          ) : null
        }
      />

      {isLoading ? (
        <Text className="px-4 text-sm text-ink-muted">Loading…</Text>
      ) : tabs.length === 0 ? (
        <EmptyNotice icon={CalendarClock} title="Nothing here yet" message="When you get tickets to events or join meetings and groups, you'll find them here. You can also start a group of your own." />
      ) : (
        <>
          <SlidingTabBar
            className="mx-4 mb-2"
            tabs={tabs.map((t) => ({ id: t, label: TAB_LABEL[t] }))}
            activeIndex={activeIndex}
            progress={progress}
            onSelect={(i) => setTab(tabs[i])}
          />

          {/* Swipe left/right to change tab — same carousel as Feed. */}
          <SwipeableTabs
            index={activeIndex}
            progress={progress}
            onIndexChange={(i) => {
              haptics.selection();
              setTab(tabs[i]);
            }}
          >
            {tabs.map((t) => (
              <ConnectPane key={t} tab={t} items={items} refetch={[refetch]} />
            ))}
          </SwipeableTabs>
        </>
      )}
    </View>
  );
}
