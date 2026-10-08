// src/screens/LibraryActivity.tsx
// Everything you've bought or opened — books, courses, media, files and links. (/activity/library redirects here.)
import { router, type Href } from "expo-router";
import { BookText, FileText, GraduationCap, Image as ImageIcon, LibraryBig, Link as LinkIcon, Music, type LucideIcon } from "lucide-react-native";
import { ScrollView, View } from "react-native";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { libraryItemRoute, useLibrary, type LibraryItem, type LibraryItemType } from "@/hooks/useLibrary";

const SECTIONS: { title: string; types: LibraryItemType[] }[] = [
  { title: "Books & courses", types: ["book", "course"] },
  { title: "Media, files & links", types: ["media", "file", "url"] },
];

const ICON_FOR: Record<LibraryItemType, LucideIcon> = { book: BookText, course: GraduationCap, media: Music, file: FileText, url: LinkIcon };
const LABEL_FOR: Record<LibraryItemType, string> = { book: "Book", course: "Course", media: "Media", file: "File", url: "Link" };

function LibraryRow({ item }: { item: LibraryItem }) {
  const unavailable = item.status === "archived";
  return (
    <ThumbRow
      onPress={() => router.push(libraryItemRoute(item) as Href)}
      thumbnailUrl={item.thumbnailUrl}
      fallbackIcon={ImageIcon}
      title={item.title}
      subtitleIcon={ICON_FOR[item.projectType]}
      subtitle={`${LABEL_FOR[item.projectType]}${item.acquiredVia === "purchased" ? " · Purchased" : " · Free"}${unavailable ? " · Archived by creator" : ""}`}
    />
  );
}

export function LibraryActivity() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { data: items, isLoading } = useLibrary();
  const list = items ?? [];

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Library" />
      {isLoading ? (
        <Text className="px-4 text-sm text-ink-muted">Loading…</Text>
      ) : list.length === 0 ? (
        <EmptyNotice icon={LibraryBig} message="Books, courses, media, files, and links you buy or open will show up here." />
      ) : (
        <ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}>
          {SECTIONS.map(({ title, types }) => {
            const rows = list.filter((i) => types.includes(i.projectType));
            if (rows.length === 0) return null;
            return (
              <View key={title} className="mb-6">
                <Text className="mb-2 text-sm font-medium text-ink-muted">{title}</Text>
                <View className="gap-2">
                  {rows.map((item) => (
                    <LibraryRow key={item.projectId} item={item} />
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
