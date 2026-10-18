// src/screens/LibraryActivity.tsx
// Everything you've bought or opened — books, courses, media, files and links. Saved projects live
// under Activity → Saved, not here. /activity/library redirects here.
import { router, type Href } from "expo-router";
import { BookText, FileText, GraduationCap, Image as ImageIcon, LibraryBig, Link as LinkIcon, Music, type LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useTabState } from "@/hooks/useTabState";
import { haptics } from "@/lib/haptics";
import { libraryItemRoute, useLibrary, type LibraryItem, type LibraryItemType } from "@/hooks/useLibrary";

// One tab per kind of thing you own — same tabbed shape as Connect.
const TABS = ["books", "courses", "media", "files", "links"] as const;
type LibraryTab = (typeof TABS)[number];

const TAB_META: Record<LibraryTab, { label: string; type: LibraryItemType; empty: string }> = {
  books: { label: "Books", type: "book", empty: "Books you buy or open will show up here." },
  courses: { label: "Courses", type: "course", empty: "Courses you buy or open will show up here." },
  media: { label: "Media", type: "media", empty: "Music, video and other media you buy or open will show up here." },
  files: { label: "Files", type: "file", empty: "Files you buy or open will show up here." },
  links: { label: "Links", type: "url", empty: "Links you buy or open will show up here." },
};

const ICON_FOR: Record<LibraryItemType, LucideIcon> = { book: BookText, course: GraduationCap, media: Music, file: FileText, url: LinkIcon };
const LABEL_FOR: Record<LibraryItemType, string> = { book: "Book", course: "Course", media: "Media", file: "File", url: "Link" };

function LibraryRow({ item }: { item: LibraryItem }) {
  const unavailable = item.status === "archived";
  return (
    <ThumbRow
      onPress={() => router.push(libraryItemRoute(item) as Href)}
      thumbnailUrl={item.thumbnailUrl}
      tall={item.projectType === "book"}
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
  const [tab, setTab] = useTabState<LibraryTab>(TABS, "books");
  const meta = TAB_META[tab];
  const rows = (items ?? []).filter((i) => i.projectType === meta.type);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Library" back={false} icon={LibraryBig} />

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
              {TAB_META[t].label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <Text className="px-4 text-sm text-ink-muted">Loading…</Text>
      ) : rows.length === 0 ? (
        <EmptyNotice icon={LibraryBig} message={meta.empty} />
      ) : (
        <ScrollView ref={onScroll.listRef} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}>
          <View className="gap-2">
            {rows.map((item) => (
              <LibraryRow key={item.projectId} item={item} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
