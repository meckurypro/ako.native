// src/screens/EventsActivity.tsx
// Tickets, meetings and cohort rooms you're part of, split into upcoming and past.
import { router, type Href } from "expo-router";
import { CalendarClock, Image as ImageIcon } from "lucide-react-native";
import { ScrollView, View } from "react-native";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useActivity, type ActivityItem } from "@/hooks/useActivity";

const ROUTE_FOR: Record<ActivityItem["kind"], (item: ActivityItem) => string> = {
  event: (item) => `/projects/${item.projectId}/ticket`,
  meeting: (item) => `/meetings/${item.projectId}`,
  room_meeting: (item) => `/rooms/${item.projectId}`,
};

const LABEL_FOR: Record<ActivityItem["kind"], string> = { event: "Event", meeting: "Meeting", room_meeting: "Room meeting" };

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

export function EventsActivity() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { data: items, isLoading } = useActivity();
  const list = items ?? [];
  const now = Date.now();
  const upcoming = list.filter((i) => !i.when || new Date(i.when).getTime() >= now);
  const past = list.filter((i) => i.when && new Date(i.when).getTime() < now);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Events & meetings" />
      {isLoading ? (
        <Text className="px-4 text-sm text-ink-muted">Loading…</Text>
      ) : list.length === 0 ? (
        <EmptyNotice icon={CalendarClock} message="Events, meetings, and rooms you've joined will show up here." />
      ) : (
        <ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}>
          <View className="mb-6">
            <Text className="mb-2 text-sm font-medium text-ink-muted">Upcoming</Text>
            <View className="gap-2">
              {upcoming.length === 0 ? <Text className="text-xs text-ink-muted">Nothing upcoming.</Text> : upcoming.map((item, i) => <ActivityRow key={`${item.kind}-${item.projectId}-${i}`} item={item} />)}
            </View>
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
