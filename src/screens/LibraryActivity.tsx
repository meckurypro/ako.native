// src/screens/LibraryActivity.tsx
// Everything you've bought or opened — books, courses, media, files and links. Saved projects live
// under Activity → Saved, not here. /activity/library redirects here.
//
// Projects you've downloaded ("Download to library") are marked here and open with no network. Offline, this list is
// narrowed to exactly those, since nothing else would open. Coming from a fresh download (?highlight=<projectId>),
// the new item is scrolled into view and briefly highlighted.
import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  BookText,
  CircleCheck,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  LibraryBig,
  Link as LinkIcon,
  Music,
  RefreshCw,
  Trash2,
  WifiOff,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import { EmptyNotice } from "@/components/activity/EmptyNotice";
import { ListItemMenu } from "@/components/activity/ListItemMenu";
import { ThumbRow } from "@/components/activity/ThumbRow";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SlidingTabBar } from "@/components/ui/SlidingTabBar";
import { SwipeableTabs } from "@/components/ui/SwipeableTabs";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useIsOnline } from "@/hooks/useIsOnline";
import { libraryItemRoute, type LibraryItem, type LibraryItemType } from "@/hooks/useLibrary";
import { useRemoveFromLibrary } from "@/hooks/useLibraryRemovals";
import { useLibraryWithDownloads, useOpenOfflineProject } from "@/hooks/useOfflineProjects";
import { useTabState } from "@/hooks/useTabState";
import { haptics } from "@/lib/haptics";
import { formatBytes, offlineErrorMessage, OfflineError } from "@/lib/offlineProjects";
import { removeOfflineProject, startOfflineDownload, useDownloadState, type OfflineEntry } from "@/lib/offlineStore";

// One tab per kind of thing you own — same tabbed shape as Connect. Tabs are dynamic: a tab only appears once
// there's something in it, and with nothing at all the screen shows a single empty state.
const ALL_TABS = ["books", "courses", "media", "files", "links"] as const;
type LibraryTab = (typeof ALL_TABS)[number];

const TAB_META: Record<LibraryTab, { label: string; type: LibraryItemType }> = {
  books: { label: "Books", type: "book" },
  courses: { label: "Courses", type: "course" },
  media: { label: "Media", type: "media" },
  files: { label: "Files", type: "file" },
  links: { label: "Links", type: "url" },
};

const ICON_FOR: Record<LibraryItemType, LucideIcon> = { book: BookText, course: GraduationCap, media: Music, file: FileText, url: LinkIcon };
const LABEL_FOR: Record<LibraryItemType, string> = { book: "Book", course: "Course", media: "Media", file: "File", url: "Link" };

const HIGHLIGHT_MS = 3500;

interface LibraryRowProps {
  item: LibraryItem;
  saved: OfflineEntry | undefined;
  updateAvailable: boolean;
  highlighted: boolean;
  onLayoutY: (projectId: string, y: number) => void;
}

function LibraryRow({ item, saved, updateAvailable, highlighted, onLayoutY }: LibraryRowProps) {
  const { user } = useAuth();
  const toast = useToast();
  const openSaved = useOpenOfflineProject();
  const download = useDownloadState(item.projectId);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const removeFromLibraryRow = useRemoveFromLibrary();

  const unavailable = item.status === "archived";
  const updating = download.phase === "downloading" || download.phase === "preparing" || download.phase === "saving";

  async function update() {
    if (!user || !saved) return;
    try {
      await startOfflineDownload({ userId: user.id, projectId: item.projectId, acquiredVia: saved.acquiredVia === "purchased" ? "purchased" : "free" });
      haptics.success();
      toast(`Updated “${item.title}”`, { variant: "success" });
    } catch (e) {
      if (e instanceof OfflineError && e.code === "cancelled") return;
      // Not on Wi-Fi and it's big: don't spend someone's data on a refresh without asking.
      toast(e instanceof OfflineError && e.code === "needs_confirmation" ? "Connect to Wi-Fi to update this download." : offlineErrorMessage(e), { variant: "error" });
    }
  }

  // Library's own actions on a downloaded copy. Pin, mute, share, copy link and "Remove from Library" come from the shared menu.
  const extraItems: DropdownMenuItem[] = [
    ...(updateAvailable && !updating
      ? [{ key: "update", label: "Update download", icon: <Icon as={RefreshCw} size={22} className="text-overlay-ink" />, onSelect: () => void update() } satisfies DropdownMenuItem]
      : []),
    ...(saved
      ? [{ key: "remove", label: "Remove download", icon: <Icon as={Trash2} size={22} className="text-overlay-ink" />, onSelect: () => setConfirmRemove(true) } satisfies DropdownMenuItem]
      : []),
  ];

  // A downloaded copy would otherwise keep the project listed (the device's own record is merged into this list), so
  // removing from the Library deletes the copy too. The hiding itself is saved on the server by the shared menu.
  async function removeDeviceCopy() {
    if (user && saved) await removeOfflineProject(user.id, item.projectId);
    await removeFromLibraryRow.mutateAsync(item.projectId);
  }

  const parts = [
    LABEL_FOR[item.projectType],
    item.acquiredVia === "purchased" ? "Purchased" : "Free",
    ...(unavailable ? ["Archived by creator"] : []),
    ...(updating ? [`Updating ${Math.round(download.progress * 100)}%`] : saved ? [`Saved offline · ${formatBytes(saved.bytes)}`] : []),
    ...(updateAvailable && !updating ? ["Update available"] : []),
    ...(item.pinned ? ["Pinned"] : []),
    ...(item.muted ? ["Muted"] : []),
  ];

  return (
    <View onLayout={(e) => onLayoutY(item.projectId, e.nativeEvent.layout.y)} className={highlighted ? "rounded-2xl bg-accent-soft p-1" : ""}>
      <ThumbRow
        onPress={() => (saved ? void openSaved(saved) : router.push(libraryItemRoute(item) as Href))}
        thumbnailUrl={item.thumbnailUrl}
        shapeOf={{ project_type: item.projectType, thumbnail_shape: item.thumbnailShape }}
        isFile={item.projectType === "file"}
        fallbackIcon={ImageIcon}
        title={item.title}
        subtitleIcon={ICON_FOR[item.projectType]}
        subtitle={parts.join(" · ")}
        trailing={
          <View className="flex-row items-center gap-1">
            {saved ? <Icon as={CircleCheck} size={16} className="text-accent" /> : null}
            <ListItemMenu
              projectId={item.projectId}
              title={item.title}
              slug={item.slug}
              pinned={item.pinned}
              muted={item.muted}
              listName="Library"
              extraItems={extraItems}
              onRemove={removeDeviceCopy}
              removeDescription={saved ? "This takes it off your library and deletes the copy saved on this device. Your access doesn't change." : undefined}
            />
          </View>
        }
      />
      {confirmRemove ? (
        <ConfirmDialog
          title="Remove this download?"
          description="It will be removed from this device. It stays in your library, and you can download it again anytime."
          confirmLabel="Remove"
          danger={false}
          onConfirm={() => {
            setConfirmRemove(false);
            if (user) void removeOfflineProject(user.id, item.projectId).then(() => toast("Download removed"));
          }}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </View>
  );
}

interface LibraryPaneProps {
  tab: LibraryTab;
  items: LibraryItem[];
  byId: Map<string, OfflineEntry>;
  stale: Set<string>;
  savedCount: number;
  totalBytes: number;
  highlightedId: string | null;
}

// One pane per tab, each with its own scroll list (see SwipeableTabs) so every tab keeps its own scroll position.
function LibraryPane({ tab, items, byId, stale, savedCount, totalBytes, highlightedId }: LibraryPaneProps) {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const meta = TAB_META[tab];

  // `items` is already narrowed to what can open (offline: only what's saved on the device).
  const rows = items.filter((i) => i.projectType === meta.type);

  // ── Scroll the item we were just sent here for into view ──
  const scrolledFor = useRef<string | null>(null);
  const rowY = useRef(new Map<string, number>());

  const scrollToHighlight = useCallback(
    (projectId: string) => {
      if (projectId !== highlightedId || scrolledFor.current === projectId) return;
      const y = rowY.current.get(projectId);
      if (y === undefined) return;
      scrolledFor.current = projectId;
      // onLayout's y is inside the rows container, which sits 8px down in the ScrollView; keep 8px of the row above it in view.
      onScroll.listRef.current?.scrollTo?.({ y: Math.max(0, y), animated: true });
    },
    [highlightedId, onScroll.listRef]
  );

  const onRowLayoutY = useCallback(
    (projectId: string, y: number) => {
      rowY.current.set(projectId, y);
      scrollToHighlight(projectId);
    },
    [scrollToHighlight]
  );

  return (
    <ScrollView showsHorizontalScrollIndicator={false} ref={onScroll.listRef} onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}>
      <View className="gap-2">
        {rows.map((item) => (
          <LibraryRow
            key={item.projectId}
            item={item}
            saved={byId.get(item.projectId)}
            updateAvailable={stale.has(item.projectId)}
            highlighted={highlightedId === item.projectId}
            onLayoutY={onRowLayoutY}
          />
        ))}
      </View>
      {savedCount > 0 ? (
        <Text className="mt-4 text-center text-xs text-ink-muted">
          {savedCount} saved on this device · {formatBytes(totalBytes)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

export function LibraryActivity() {
  const online = useIsOnline();
  const { items, byId, stale, savedCount, totalBytes, isLoading } = useLibraryWithDownloads();

  // Offline, only what's saved on the device can open — showing the rest would just be a list of dead ends.
  const visibleItems = useMemo(() => items.filter((i) => online || byId.has(i.projectId)), [items, online, byId]);

  // Only tabs that have something in them are shown.
  const tabs = useMemo(() => ALL_TABS.filter((t) => visibleItems.some((i) => i.projectType === TAB_META[t].type)), [visibleItems]);
  const [tab, setTab] = useTabState<LibraryTab>(ALL_TABS, tabs[0] ?? "books");
  // If the selected tab disappears (e.g. its last item was removed), fall back to the first one left.
  const activeIndex = Math.max(tabs.indexOf(tab), 0);
  const progress = useSharedValue(activeIndex);

  // ── Highlight the item we were just sent here for ──
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const [highlightedId, setHighlightedId] = useState<string | null>(typeof highlight === "string" && highlight ? highlight : null);

  useEffect(() => {
    if (typeof highlight === "string" && highlight) setHighlightedId(highlight);
  }, [highlight]);

  useEffect(() => {
    if (!highlightedId) return;
    const t = setTimeout(() => {
      setHighlightedId(null);
      // Drop the param too, so coming back to this screen later doesn't flash it again.
      router.setParams({ highlight: undefined });
    }, HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [highlightedId]);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Library" back={false} icon={LibraryBig} iconClassName="text-brand-orange" titleClassName="text-[28px] font-bold leading-tight tracking-tight text-ink" />

      {!online ? (
        <View accessibilityRole="alert" className="mx-4 mb-2 flex-row items-center gap-2 rounded-xl bg-surface px-3 py-2">
          <Icon as={WifiOff} size={14} className="text-ink-muted" />
          <Text className="flex-1 text-xs text-ink-muted">You're offline. Showing what's saved on this device.</Text>
        </View>
      ) : null}

      {isLoading ? (
        <Text className="px-4 text-sm text-ink-muted">Loading…</Text>
      ) : tabs.length === 0 ? (
        <EmptyNotice
          icon={LibraryBig}
          title={online ? "Your library is empty" : "Nothing saved on this device"}
          message={online ? "When you buy or open books, courses, media, files or links, you'll find them here." : "Download something while you're online to use it offline."}
        />
      ) : (
        <>
          <SlidingTabBar
            className="mx-4 mb-2"
            tabs={tabs.map((t) => ({ id: t, label: TAB_META[t].label }))}
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
              <LibraryPane key={t} tab={t} items={visibleItems} byId={byId} stale={stale} savedCount={savedCount} totalBytes={totalBytes} highlightedId={highlightedId} />
            ))}
          </SwipeableTabs>
        </>
      )}
    </View>
  );
}
