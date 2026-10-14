// src/screens/LibraryActivity.tsx
// Two shelves: Owned (everything you've bought or opened — books, courses, media, files and links)
// and Saved (projects you've bookmarked for later). Separate tabs, not one mixed list, so a saved
// paid project never looks like something you already have. /activity/library and /saved-projects redirect here.
import { router, type Href } from "expo-router";
import { Bookmark, BookText, FileText, GraduationCap, Image as ImageIcon, LibraryBig, Link as LinkIcon, Music, type LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ProjectList } from "@/components/project/ProjectList";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { libraryItemRoute, useLibrary, type LibraryItem, type LibraryItemType } from "@/hooks/useLibrary";
import { useSavedProjects } from "@/hooks/useSavedProjects";
import { useTabState } from "@/hooks/useTabState";
import { haptics } from "@/lib/haptics";

const TABS = ["owned", "saved"] as const;
type LibraryTab = (typeof TABS)[number];

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
  const { data: saved, isLoading: savedLoading, refetch: refetchSaved } = useSavedProjects();
  const [tab, setTab] = useTabState<LibraryTab>(TABS, "owned");
  const list = items ?? [];

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Library" />

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
            <Text className={`text-sm font-medium ${tab === t ? "text-accent" : "text-ink-muted"}`}>
              {t === "owned" ? "Owned" : "Saved"}
              {t === "saved" && saved && saved.length > 0 ? <Text className="text-xs font-normal text-ink-muted">{`  ${saved.length}`}</Text> : null}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "saved" ? (
        savedLoading || (saved && saved.length > 0) ? (
          <ProjectList projects={saved} isLoading={savedLoading} emptyMessage="" onRefresh={refetchSaved} />
        ) : (
          <EmptyNotice icon={Bookmark} message="Tap the bookmark icon on a project to keep it here for later." />
        )
      ) : isLoading ? (
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
