// src/screens/DiscoverMore.tsx
// "More" from a Discover row: everything of one kind (events, courses, books, … or pages), in a tight
// three-up grid, loaded a page at a time on request — a button, not endless scroll, so the list never
// runs away from the reader. Works the same for restricted and full accounts.
import { Redirect, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";

import { DiscoverTile } from "@/components/discover/DiscoverRail";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { PageRow } from "@/components/post/PageRow";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { getDiscoverSectionTitle, useDiscoverMore, useDiscoverPagesMore } from "@/hooks/useDiscoverBrowse";
import type { ProjectType } from "@/hooks/useProjects";

const COLUMNS = 3;
const GAP = 12;
const PAGE_PADDING = 16;
const MAX_CONTENT_WIDTH = 576; // max-w-xl, like every other screen

function ShowMore({ onPress, loading }: { onPress: () => void; loading: boolean }) {
  return (
    <View className="mt-6 items-center">
      <Pressable
        onPress={onPress}
        disabled={loading}
        accessibilityRole="button"
        className={`rounded-full border border-border bg-surface px-5 py-2.5 active:border-accent-a50 ${loading ? "opacity-60" : ""}`}
      >
        <Text className="text-sm font-medium text-ink">{loading ? "Loading…" : "Show more"}</Text>
      </Pressable>
    </View>
  );
}

function Notice({ children }: { children: string }) {
  return <Text className="py-4 text-sm text-ink-muted">{children}</Text>;
}

function ProjectsMore({ type, tileWidth }: { type: ProjectType; tileWidth: number }) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useDiscoverMore(type);
  const items = (data?.pages ?? []).flatMap((p) => p.items);

  if (isLoading) return <Notice>Loading…</Notice>;
  if (isError) return <Notice>Couldn't load this right now. Try again in a moment.</Notice>;
  if (items.length === 0) return <Notice>Nothing here yet.</Notice>;

  return (
    <>
      <View className="flex-row flex-wrap" style={{ columnGap: GAP, rowGap: 20 }}>
        {items.map((item) => (
          <DiscoverTile key={item.project.id} item={item} width={tileWidth} />
        ))}
      </View>
      {hasNextPage ? <ShowMore onPress={() => fetchNextPage()} loading={isFetchingNextPage} /> : null}
    </>
  );
}

function PagesMore() {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useDiscoverPagesMore();
  const pages = (data?.pages ?? []).flat();

  if (isLoading) return <Notice>Loading…</Notice>;
  if (isError) return <Notice>Couldn't load this right now. Try again in a moment.</Notice>;
  if (pages.length === 0) return <Notice>Nothing here yet.</Notice>;

  return (
    <>
      {pages.map((p) => (
        <View key={p.id} className="border-b border-border">
          <PageRow page={p} />
        </View>
      ))}
      {hasNextPage ? <ShowMore onPress={() => fetchNextPage()} loading={isFetchingNextPage} /> : null}
    </>
  );
}

export function DiscoverMore() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { width } = useWindowDimensions();
  const title = getDiscoverSectionTitle(section ?? "");

  // An unknown kind (a stale link, a typo) goes back to Discover rather than a blank screen.
  if (!title) return <Redirect href="/topics" />;

  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH + PAGE_PADDING * 2) - PAGE_PADDING * 2;
  const tileWidth = Math.floor((contentWidth - GAP * (COLUMNS - 1)) / COLUMNS);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={title} bar />
      <ScrollView
        ref={onScroll.listRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, paddingTop: 16, paddingBottom: bottomInset }}
      >
        <View className="w-full max-w-xl self-center">
          {section === "pages" ? <PagesMore /> : <ProjectsMore type={section as ProjectType} tileWidth={tileWidth} />}
        </View>
      </ScrollView>
    </View>
  );
}
