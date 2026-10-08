// src/screens/HistoryActivity.tsx
// Posts and projects you've opened, most recent first.
import { FlashList } from "@shopify/flash-list";
import { router, type Href } from "expo-router";
import { FileText, History as HistoryIcon, Image as ImageIcon } from "lucide-react-native";
import { View } from "react-native";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useViewHistory, type HistoryItem } from "@/hooks/useViewHistory";

function HistoryRow({ item }: { item: HistoryItem }) {
  const isPost = item.kind === "post";
  const href = (isPost ? `/post/${item.post.id}` : `/projects/${item.project.id}`) as Href;
  const title: string = isPost ? item.post.heading || item.post.content?.slice(0, 80) || "Post" : item.project.title;
  const subtitle = isPost ? `Post by ${item.post.author?.display_name ?? "someone"}` : "Project";

  return (
    <ThumbRow
      variant="line"
      size={44}
      onPress={() => router.push(href)}
      thumbnailUrl={isPost ? null : item.project.thumbnail_url}
      fallbackIcon={isPost ? FileText : ImageIcon}
      title={title}
      subtitle={subtitle}
      trailing={<Text className="shrink-0 text-xs text-ink-muted">{new Date(item.viewedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>}
    />
  );
}

export function HistoryActivity() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { data: items, isLoading } = useViewHistory();

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="History" />
      {isLoading ? (
        <Text className="px-4 text-sm text-ink-muted">Loading…</Text>
      ) : !items || items.length === 0 ? (
        <EmptyNotice icon={HistoryIcon} message="Posts and projects you open will show up here, most recent first." />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(item) => `${item.kind}-${item.post?.id ?? item.project?.id}-${item.viewedAt}`}
          renderItem={({ item }) => <HistoryRow item={item} />}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset }}
        />
      )}
    </View>
  );
}
