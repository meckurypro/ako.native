// src/components/project/book/BookReflowReader.tsx
//
// Reader for authored (text) books, modelled on Apple Books:
//   - Contents screen with a Continue button, then a distraction-free page
//   - "N pages left in chapter" up top, "185 of 736" + a menu button below
//   - tap the page to show/hide the top bar and the book scrubber
//   - menu: Contents · %, Bookmarks, Search Book, Themes & Settings
//   - return pill after any jump (contents, search, bookmark, scrubber)
//   - themes: Original / Quiet / Paper / Bold / Calm / Focus, font, spacing, justify
//
// Text reflows (it is real text, not a raster page), so "page" means one screenful at
// the current type size: estimated from text length for chapters you haven't opened and
// measured for the open one. Reading position (chapter + scroll fraction) is saved to
// the server, debounced. The theme opens in the app's light/dark and a pick lasts for
// the session (see useBookReaderTheme); type settings persist.
import Slider from "@react-native-community/slider";
import { StatusBar } from "expo-status-bar";
import { ArrowUpToLine, Bookmark, Check, ChevronLeft, ChevronRight, List, RotateCcw, Search, Share as ShareIcon, Star, Type } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  Share,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideInUp, SlideOutDown, SlideOutUp, ZoomIn, ZoomOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeedDoorway } from "@/components/project/FeedDoorway";
import { ResumePrompt } from "@/components/ui/ResumePrompt";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import {
  BOOK_SECTION_INFO,
  useAddBookBookmark,
  useBookBookmarks,
  useBookProgress,
  useDeleteBookBookmark,
  useSaveBookProgress,
  type BookBookmark,
  type BookChapter,
} from "@/hooks/useBookBuilder";
import { useBookReaderTheme } from "@/hooks/useBookReaderTheme";
import { useCanReviewBook, useMyBookReview } from "@/hooks/useBookReviews";
import { useFeedDoorway } from "@/hooks/useFeedDoorway";
import { parseBook, type BookBlock } from "@/lib/bookFormat";
import { chapterPlainText, readingMinutes, snippetAt, splitChapterOpener } from "@/lib/bookReaderText";
import {
  DEFAULT_FONT_SIZE,
  LINE_HEIGHT,
  READER_STORAGE,
  READER_THEMES,
  clampFontSize,
  coerceFont,
  coerceSpacing,
  estimatePages,
  locate,
  resolveOverall,
  type PageMetrics,
  type ReaderFontId,
  type ReaderThemeSpec,
} from "@/lib/bookReaderTheme";
import { haptics } from "@/lib/haptics";
import { ChapterScrollMark, useChapterScrollMark } from "./ChapterScrollMark";

import { BookRichText, Ornament, Span, type BookFamily, type Face } from "./BookRichText";
import { ContentsSheet, SearchSheet, SettingsSheet, chapterLabel, type ContentsTab } from "./ReaderSheets";
import { ReviewSheet } from "./ReviewSheet";
import { StarPicker, StarRow } from "./Stars";

const SAVE_DEBOUNCE_MS = 900;
const PAD_X = 24;
const MAX_COLUMN = 640;
const FOOTER_H = 58;
const FAMILY_OF: Record<ReaderFontId, BookFamily> = { serif: "serif", sans: "body", display: "display" };

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the setting just won't persist */
  }
}

type SheetName = null | "contents" | "search" | "settings" | "review";

interface BookReflowReaderProps {
  projectId: string;
  title: string;
  chapters: BookChapter[];
  userId: string | undefined;
  thumbnailUrl?: string | null;
  /** Public link to the book, for the Share button. */
  shareUrl?: string;
}

// The page text is the expensive part of the tree; the reader re-renders as the page counter
// ticks while scrolling, so keep the body out of that.
const ChapterBody = memo(function ChapterBody({
  opener,
  theme,
  fontSize,
  lineHeight,
  family,
  justify,
  onInteract,
}: {
  opener: { eyebrow: string | null; title: string; body: BookBlock[] };
  theme: ReaderThemeSpec;
  fontSize: number;
  lineHeight: number;
  family: BookFamily;
  justify: boolean;
  onInteract: () => void;
}) {
  const face: Face = { family, heavy: !!theme.heavy };
  return (
    <>
      <View style={{ alignItems: "center", marginTop: 20, marginBottom: 32 }}>
        {opener.eyebrow ? (
          <Text className="mb-3 text-xs font-semibold uppercase" style={{ color: theme.muted, letterSpacing: 2.4 }}>
            {opener.eyebrow}
          </Text>
        ) : null}
        <Span face={face} kind="semibold" selectable style={{ color: theme.ink, fontSize: fontSize * 1.85, lineHeight: fontSize * 1.85 * 1.15, textAlign: "center" }}>
          {opener.title}
        </Span>
        <View style={{ marginTop: 20 }}>
          <Ornament color={theme.muted} width={112} />
        </View>
      </View>
      {opener.body.length > 0 ? (
        <BookRichText blocks={opener.body} ink={theme.ink} muted={theme.muted} accent={theme.accent} onInteract={onInteract} fontSize={fontSize} family={family} lineHeight={lineHeight} justify={justify} heavy={theme.heavy} ornament />
      ) : (
        <Span face={face} style={{ color: theme.muted, fontSize }}>
          Nothing here yet.
        </Span>
      )}
    </>
  );
});

export function BookReflowReader({ projectId, title, chapters, userId, thumbnailUrl, shareUrl }: BookReflowReaderProps) {
  const insets = useSafeAreaInsets();
  const { data: progress, isLoading: progressLoading } = useBookProgress(projectId, userId);
  const saveProgress = useSaveBookProgress(projectId, userId);
  const { data: bookmarkData } = useBookBookmarks(projectId, userId);
  const addBookmark = useAddBookBookmark(projectId, userId);
  const deleteBookmark = useDeleteBookBookmark(projectId, userId);
  // Reviews: the owner and anyone without access can't review, so the entry points only show for readers who can.
  const { data: canReview } = useCanReviewBook(projectId);
  const { review: myReview } = useMyBookReview(projectId);
  const [reviewSeed, setReviewSeed] = useState<number | undefined>(undefined);
  const bookDoorway = useFeedDoorway("book");
  const bookmarks = useMemo(() => bookmarkData ?? [], [bookmarkData]);

  const [view, setView] = useState<"toc" | "chapter">("toc");
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [themeId, setThemeId] = useBookReaderTheme();
  const theme = READER_THEMES[themeId];
  const [fontSize, setFontSize] = useState<number>(() => {
    const n = Number(readStored(READER_STORAGE.fontSize));
    return n ? clampFontSize(n) : DEFAULT_FONT_SIZE;
  });
  const [fontPick, setFontPick] = useState<string | null>(() => readStored(READER_STORAGE.font));
  const font = coerceFont(fontPick, themeId);
  const [spacing, setSpacing] = useState(() => coerceSpacing(readStored(READER_STORAGE.spacing)));
  const [justify, setJustify] = useState(() => readStored(READER_STORAGE.justify) === "1");

  const [chromeVisible, setChromeVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [contentsTab, setContentsTab] = useState<ContentsTab>("contents");
  const [resumed, setResumed] = useState(false);
  // Where the reader stopped last time, offered once on reopening: continue there, or start from the beginning.
  const [resumeOffer, setResumeOffer] = useState<{ chapterId: string; fraction: number } | null>(null);
  const [fraction, setFraction] = useState(0);
  const scrollMark = useChapterScrollMark();
  const [dims, setDims] = useState({ vw: 390, vh: 800, contentH: 0 });
  const [scrub, setScrub] = useState<number | null>(null);
  const [jumpBack, setJumpBack] = useState<{ chapterId: string; fraction: number; label: string } | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportH = useRef(0);
  const totalH = useRef(0);
  const lastY = useRef(0);
  const chromeAnchor = useRef(0);
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const pendingFraction = useRef<number | null>(null);

  useEffect(() => writeStored(READER_STORAGE.fontSize, String(fontSize)), [fontSize]);
  useEffect(() => {
    if (fontPick) writeStored(READER_STORAGE.font, fontPick);
  }, [fontPick]);
  useEffect(() => writeStored(READER_STORAGE.spacing, spacing), [spacing]);
  useEffect(() => writeStored(READER_STORAGE.justify, justify ? "1" : "0"), [justify]);

  // The last position not yet sent. Saves are debounced while scrolling, so leaving the screen or backgrounding the
  // app (which Android may then kill) must send it straight away, not drop it.
  const unsaved = useRef<{ chapterId: string; scrollFraction: number } | null>(null);
  const saveMutate = saveProgress.mutate;
  const flushSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const pending = unsaved.current;
    unsaved.current = null;
    if (pending) saveMutate(pending);
  }, [saveMutate]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") flushSave();
    });
    return () => {
      sub.remove();
      flushSave();
    };
  }, [flushSave]);

  // Resume: once the saved position has loaded, offer to reopen the last chapter at the saved scroll position.
  // (Waits for the progress query — resolving before it arrived used to skip resuming altogether.)
  useEffect(() => {
    if (resumed || chapters.length === 0 || progressLoading) return;
    setResumed(true);
    const savedId = progress?.current_chapter_id;
    const idx = savedId ? chapters.findIndex((c) => c.id === savedId) : -1;
    if (idx < 0) return;
    const f = progress?.scroll_fraction ?? 0;
    // Nothing worth resuming if they only ever opened the very start of the first chapter.
    if (idx === 0 && f < 0.02) return;
    setResumeOffer({ chapterId: chapters[idx].id, fraction: f });
  }, [resumed, chapters, progress, progressLoading]);

  function continueReading() {
    if (!resumeOffer) return;
    haptics.selection();
    setJumpBack(null);
    pendingFraction.current = resumeOffer.fraction;
    setChapterId(resumeOffer.chapterId);
    setView("chapter");
    setResumeOffer(null);
  }

  function startOver() {
    setResumeOffer(null);
    if (!chapters[0]) return;
    haptics.selection();
    setJumpBack(null);
    pendingFraction.current = null;
    setChapterId(chapters[0].id);
    setView("chapter");
    // The beginning is now the place to come back to.
    unsaved.current = { chapterId: chapters[0].id, scrollFraction: 0 };
    flushSave();
  }

  const currentIndex = chapters.findIndex((c) => c.id === chapterId);
  const current = currentIndex >= 0 ? chapters[currentIndex] : null;
  // Each chapter starts with the scroll mark hidden.
  const currentChapterId = current?.id;
  const resetScrollMark = scrollMark.reset;
  useEffect(() => {
    resetScrollMark();
  }, [currentChapterId, resetScrollMark]);
  // The thumb travels the visible page: below the status bar, above the footer.
  const markTop = insets.top + 8;
  const markH = Math.max(40, dims.vh - markTop - (insets.bottom + FOOTER_H));
  const setScrollMarkTrack = scrollMark.setTrack;
  useEffect(() => {
    setScrollMarkTrack(markH);
  }, [markH, setScrollMarkTrack]);
  const prev = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  // Android back unwinds one layer at a time: sheet, then menu, then the chapter.
  useBackDismiss(() => setView("toc"), view === "chapter" && !sheet && !menuOpen);
  useBackDismiss(() => setMenuOpen(false), menuOpen && !sheet);
  useBackDismiss(() => setSheet(null), sheet !== null);

  // ---------- page estimates ----------
  const lineHeight = LINE_HEIGHT[spacing];
  const plainLengths = useMemo(() => chapters.map((c) => chapterPlainText(c.content).length), [chapters]);
  const chapterPages = useMemo(() => {
    const m: PageMetrics = { viewportW: dims.vw, viewportH: dims.vh, fontSize, lineHeight, padX: PAD_X, maxColumn: MAX_COLUMN };
    const est = plainLengths.map((n) => estimatePages(n, m));
    if (currentIndex >= 0 && dims.contentH > 0 && dims.vh > 0) est[currentIndex] = Math.max(1, Math.round(dims.contentH / (dims.vh * 0.86)));
    return est;
  }, [plainLengths, dims, fontSize, lineHeight, currentIndex]);
  const startPages = useMemo(() => {
    let acc = 1;
    return chapterPages.map((p) => {
      const at = acc;
      acc += p;
      return at;
    });
  }, [chapterPages]);
  const position = useMemo(() => locate(chapterPages, Math.max(0, currentIndex), current ? fraction : 0), [chapterPages, currentIndex, current, fraction]);

  const opener = useMemo(() => {
    if (!current) return null;
    return splitChapterOpener(parseBook(current.content), current.title, current.kind === "chapter" ? null : BOOK_SECTION_INFO[current.kind].label);
  }, [current]);

  // ---------- scrolling ----------
  const applyPending = useCallback(() => {
    const f = pendingFraction.current;
    if (f == null || viewportH.current === 0 || totalH.current === 0) return;
    const range = totalH.current - viewportH.current;
    if (range <= 0 && f > 0) return;
    pendingFraction.current = null;
    scrollRef.current?.scrollTo({ y: f * Math.max(0, range), animated: false });
    setFraction(Math.min(1, Math.max(0, f)));
  }, []);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!current) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const range = contentSize.height - layoutMeasurement.height;
    const f = range > 0 ? Math.min(1, Math.max(0, contentOffset.y / range)) : 0;
    lastY.current = contentOffset.y;
    scrollMark.onMetrics(contentOffset.y, contentSize.height, layoutMeasurement.height);
    setFraction((old) => (Math.abs(old - f) > 0.003 || f === 0 || f === 1 ? f : old));
    if (chromeVisible && Math.abs(contentOffset.y - chromeAnchor.current) > 90) setChromeVisible(false);
    if (menuOpen) setMenuOpen(false);
    // While a saved position is still waiting to be applied the scroller sits at the top: that isn't progress.
    if (pendingFraction.current != null) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    unsaved.current = { chapterId: current.id, scrollFraction: f };
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }

  const interactAt = useRef(0);
  const markInteract = useCallback(() => {
    interactAt.current = Date.now();
  }, []);

  // A tap is a short touch that barely moved: it toggles the chrome. Scrolls and text-selection drags don't.
  function onTouchStart(e: GestureResponderEvent) {
    touch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, t: Date.now() };
  }
  function onTouchEnd(e: GestureResponderEvent) {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const moved = Math.hypot(e.nativeEvent.pageX - s.x, e.nativeEvent.pageY - s.y);
    if (moved > 8 || Date.now() - s.t > 280) return;
    // A tap on a link or a Copy button also reaches here. Wait a beat, and if one of those just fired, leave the chrome alone.
    setTimeout(() => {
      if (Date.now() - interactAt.current < 500) return;
      if (menuOpen) {
        setMenuOpen(false);
        return;
      }
      chromeAnchor.current = lastY.current;
      setChromeVisible((v) => !v);
    }, 60);
  }

  // ---------- navigation ----------
  function goTo(id: string, f: number, remember = true) {
    haptics.selection();
    if (remember && current) setJumpBack({ chapterId: current.id, fraction, label: current.title });
    pendingFraction.current = f;
    // Record the new place straight away, even if they leave before scrolling.
    unsaved.current = { chapterId: id, scrollFraction: f };
    flushSave();
    setSheet(null);
    setMenuOpen(false);
    setChromeVisible(false);
    if (id === chapterId && view === "chapter") applyPending();
    else {
      setChapterId(id);
      setView("chapter");
    }
  }
  function openChapterSequential(id: string) {
    setJumpBack(null);
    goTo(id, 0, false);
  }

  // ---------- bookmarks ----------
  const bookmarkWindow = dims.contentH > 0 ? Math.max(0.015, (0.6 * dims.vh) / dims.contentH) : 0.03;
  const marked: BookBookmark | undefined = current ? bookmarks.find((b) => b.chapter_id === current.id && Math.abs(b.scroll_fraction - fraction) < bookmarkWindow) : undefined;

  function toggleBookmark() {
    if (!current) return;
    haptics.light();
    if (marked) deleteBookmark.mutate(marked.id);
    else addBookmark.mutate({ chapterId: current.id, scrollFraction: fraction, snippet: snippetAt(chapterPlainText(current.content), fraction) });
  }
  const pageOfBookmark = (b: BookBookmark) => {
    const idx = chapters.findIndex((c) => c.id === b.chapter_id);
    return idx < 0 ? 1 : locate(chapterPages, idx, b.scroll_fraction).page;
  };

  async function share() {
    setMenuOpen(false);
    try {
      await Share.share(shareUrl ? { message: shareUrl, url: shareUrl, title } : { message: title });
    } catch {
      /* dismissed */
    }
  }

  // ---------- contents screen ----------
  if (view === "toc" || !current || !opener) {
    const savedIndex = progress?.current_chapter_id ? chapters.findIndex((c) => c.id === progress.current_chapter_id) : -1;
    const m: PageMetrics = { viewportW: dims.vw, viewportH: dims.vh, fontSize, lineHeight, padX: PAD_X, maxColumn: MAX_COLUMN };
    const pages = plainLengths.map((n) => estimatePages(n, m));
    const savedOverall = savedIndex >= 0 ? locate(pages, savedIndex, progress?.scroll_fraction ?? 0).overall : 0;
    const startChapter = savedIndex >= 0 ? chapters[savedIndex] : chapters[0];
    const totalMinutes = chapters.reduce((a, c) => a + readingMinutes(chapterPlainText(c.content)), 0);

    const openAt = (idx: number) => {
      haptics.selection();
      setJumpBack(null);
      pendingFraction.current = idx === savedIndex ? (progress?.scroll_fraction ?? 0) : 0;
      unsaved.current = { chapterId: chapters[idx].id, scrollFraction: pendingFraction.current };
      flushSave();
      setChapterId(chapters[idx].id);
      setView("chapter");
    };

    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title={title} bar />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          <View className="items-center gap-3 pb-6 pt-8">
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={{ width: 144, aspectRatio: 2 / 3, borderRadius: 8 }} contentFit="cover" />
            ) : (
              <View className="justify-end rounded-lg bg-surface p-3" style={{ width: 144, aspectRatio: 2 / 3 }}>
                <Text className="font-display text-base text-ink">{title}</Text>
              </View>
            )}
            <Text className="mt-2 text-center font-display text-xl text-ink">{title}</Text>
            <Text className="text-xs text-ink-muted">
              {`${chapters.length} ${chapters.length === 1 ? "section" : "sections"} · about ${totalMinutes} min read${savedOverall > 0 ? ` · ${Math.round(savedOverall * 100)}% read` : ""}`}
            </Text>
            {startChapter ? (
              <Pressable onPress={() => openAt(chapters.indexOf(startChapter))} accessibilityRole="button" className="mt-1 rounded-full bg-accent px-7 py-2.5 active:opacity-80">
                <Text className="text-sm font-semibold text-canvas">{savedIndex >= 0 ? "Continue reading" : "Start reading"}</Text>
              </Pressable>
            ) : null}
          </View>

          {chapters.map((c, i) => {
            const read = savedIndex >= 0 && i < savedIndex;
            return (
              <Pressable key={c.id} onPress={() => openAt(i)} accessibilityRole="button" className={`flex-row items-center gap-3 px-1 py-3.5 active:opacity-60 ${i === 0 ? "" : "border-t border-border"}`}>
                <View className="min-w-0 flex-1">
                  <Text className="text-[11px] uppercase tracking-wide text-ink-muted">{chapterLabel(c)}</Text>
                  <Text numberOfLines={1} className="text-[15px] font-medium text-ink">
                    {c.title}
                  </Text>
                </View>
                <Text className="text-xs text-ink-muted">{`${readingMinutes(chapterPlainText(c.content))} min`}</Text>
                {read ? <Icon as={Check} size={15} className="text-accent" /> : <Icon as={ChevronRight} size={15} className="text-ink-muted" />}
              </Pressable>
            );
          })}
          {bookDoorway.visible && <FeedDoorway context="book" onEnter={bookDoorway.markEnteredFeed} />}
        </ScrollView>
        {resumeOffer
          ? (() => {
              const i = chapters.findIndex((c) => c.id === resumeOffer.chapterId);
              return (
                <ResumePrompt
                  kind="book"
                  where={i >= 0 ? `“${chapters[i].title}”` : "where you stopped"}
                  percent={i >= 0 ? ((i + resumeOffer.fraction) / chapters.length) * 100 : null}
                  onContinue={continueReading}
                  onStartOver={startOver}
                />
              );
            })()
          : null}
      </View>
    );
  }

  // ---------- page ----------
  const overallPct = Math.round(position.overall * 100);
  const padTop = insets.top + 40;
  const padBottom = insets.bottom + FOOTER_H + 56;
  const commitScrub = (v: number) => {
    const target = resolveOverall(chapterPages, v / 1000);
    setScrub(null);
    const c = chapters[target.index];
    if (c) goTo(c.id, target.fraction);
  };
  const menuItems = [
    { label: `Contents · ${overallPct}%`, icon: List, run: () => { setContentsTab("contents"); setSheet("contents"); setMenuOpen(false); } },
    { label: "Bookmarks", count: bookmarks.length, icon: Bookmark, run: () => { setContentsTab("bookmarks"); setSheet("contents"); setMenuOpen(false); } },
    { label: "Search Book", icon: Search, run: () => { setSheet("search"); setMenuOpen(false); } },
    ...(canReview || myReview
      ? [{ label: myReview ? "Your Review" : "Rate & Review", icon: Star, run: () => { setReviewSeed(undefined); setSheet("review"); setMenuOpen(false); } }]
      : []),
    { label: "Themes & Settings", icon: Type, run: () => { setSheet("settings"); setMenuOpen(false); } },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? "light" : "dark"} />

      <ScrollView
        // Remount per chapter so scroll offset and layout start clean.
        key={current.id}
        ref={scrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onScrollBeginDrag={scrollMark.onBeginDrag}
        onScrollEndDrag={scrollMark.onEndDrag}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onLayout={(e: LayoutChangeEvent) => {
          // Read the event now: React runs the setDims updater later, when the event has already been released.
          const { width, height } = e.nativeEvent.layout;
          viewportH.current = height;
          setDims((d) => ({ ...d, vw: width, vh: height }));
          applyPending();
        }}
        onContentSizeChange={(_w, h) => {
          totalH.current = h;
          setDims((d) => ({ ...d, contentH: Math.max(0, h - padTop - padBottom) }));
          applyPending();
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: padTop, paddingBottom: padBottom, paddingHorizontal: PAD_X }}
      >
        <View style={{ width: "100%", maxWidth: MAX_COLUMN, alignSelf: "center" }}>
          <ChapterBody opener={opener} theme={theme} fontSize={fontSize} lineHeight={lineHeight} family={FAMILY_OF[font]} justify={justify} onInteract={markInteract} />

          <View style={{ alignItems: "center", gap: 12, marginTop: 56, marginBottom: 8 }}>
            <Ornament color={theme.muted} width={112} />
            {next ? (
              <>
                <Text className="text-[11px] font-semibold uppercase" style={{ color: theme.muted, letterSpacing: 1.6 }}>
                  {`Next · ${chapterLabel(next)}`}
                </Text>
                <Text className="text-center text-[17px] font-semibold" style={{ color: theme.ink }}>
                  {next.title}
                </Text>
                <Pressable onPress={() => openChapterSequential(next.id)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: theme.ink }}>
                  <Text className="text-sm font-semibold" style={{ color: theme.bg }}>
                    Continue
                  </Text>
                  <Icon as={ChevronRight} size={16} color={theme.bg} />
                </Pressable>
              </>
            ) : (
              <>
                <Text className="text-[15px] font-semibold" style={{ color: theme.ink }}>
                  {`You've reached the end of ${title}`}
                </Text>
                {canReview || myReview ? (
                  <View style={{ alignItems: "center", gap: 8, paddingVertical: 4 }}>
                    <Text className="text-[13px]" style={{ color: theme.muted }}>
                      {myReview ? "Your rating" : "How was it? Tap to rate"}
                    </Text>
                    {myReview ? (
                      <Pressable onPress={() => { setReviewSeed(undefined); setSheet("review"); }} accessibilityRole="button" accessibilityLabel="Edit your review" hitSlop={8}>
                        <StarRow rating={myReview.rating} size={26} on={theme.accent} off={theme.rule} />
                      </Pressable>
                    ) : (
                      <StarPicker value={0} size={30} on={theme.accent} off={theme.rule} onChange={(n) => { setReviewSeed(n); setSheet("review"); }} />
                    )}
                  </View>
                ) : null}
                <Pressable onPress={() => setView("toc")} accessibilityRole="button" style={{ borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: theme.ink }}>
                  <Text className="text-sm font-semibold" style={{ color: theme.bg }}>
                    Back to contents
                  </Text>
                </Pressable>
              </>
            )}
            {prev ? (
              <Pressable onPress={() => openChapterSequential(prev.id)} accessibilityRole="button" hitSlop={8} style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                <Icon as={ChevronLeft} size={14} color={theme.muted} />
                <Text className="text-[13px]" style={{ color: theme.muted }}>
                  Previous chapter
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* Scroll indicator on the right edge, like the web reader's scrollbar: only while scrolling */}
      <ChapterScrollMark mark={scrollMark} color={theme.muted} top={markTop} height={markH} />

      {/* Return pill after a jump */}
      {jumpBack && !chromeVisible ? (
        <Animated.View entering={ZoomIn.duration(160)} exiting={ZoomOut.duration(120)} style={{ position: "absolute", left: 16, top: insets.top + 4, maxWidth: "46%" }}>
          <Pressable
            onPress={() => {
              goTo(jumpBack.chapterId, jumpBack.fraction, false);
              setJumpBack(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Return to ${jumpBack.label}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: theme.sheet }}
          >
            <Icon as={RotateCcw} size={13} color={theme.ink} />
            <Text className="text-xs font-semibold" style={{ color: theme.ink }}>
              Return
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Bookmark ribbon when this spot is saved */}
      {marked ? (
        <View pointerEvents="none" style={{ position: "absolute", right: 20, top: insets.top }}>
          <Icon as={Bookmark} size={24} color={theme.accent} fill={theme.accent} />
        </View>
      ) : null}

      {/* Footer: menu button (progress is the left-edge scroll mark; the scrubber shows pages on demand) */}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: insets.bottom + FOOTER_H, backgroundColor: `${theme.bg}F2` }}>
        <Pressable
          onPress={() => {
            haptics.light();
            setMenuOpen((o) => !o);
          }}
          accessibilityRole="button"
          accessibilityLabel="Reader menu"
          accessibilityState={{ expanded: menuOpen }}
          style={{ position: "absolute", right: 16, top: 6, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: theme.sheet }}
        >
          <Icon as={List} size={20} color={theme.ink} />
        </Pressable>
      </View>

      {/* Scrubber */}
      {chromeVisible ? (
        <Animated.View
          entering={SlideInDown.duration(180)}
          exiting={SlideOutDown.duration(150)}
          style={{ position: "absolute", left: 12, right: 12, bottom: insets.bottom + FOOTER_H + 4, borderRadius: 16, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, backgroundColor: theme.sheet, borderWidth: 1, borderColor: theme.rule }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text numberOfLines={1} className="flex-1 pr-3 text-[11px]" style={{ color: theme.muted }}>
              {current.title}
            </Text>
            <Text className="text-[11px]" style={{ color: theme.muted }}>
              {scrub != null ? `${Math.max(1, Math.round((scrub / 1000) * position.totalPages))} of ${position.totalPages}` : `${overallPct}%`}
            </Text>
          </View>
          <Slider
            minimumValue={0}
            maximumValue={1000}
            value={scrub ?? Math.round(position.overall * 1000)}
            onValueChange={(v) => setScrub(v)}
            onSlidingComplete={commitScrub}
            minimumTrackTintColor={theme.ink}
            maximumTrackTintColor={theme.rule}
            thumbTintColor={theme.ink}
            accessibilityLabel="Position in book"
          />
        </Animated.View>
      ) : null}

      {/* Top bar */}
      {chromeVisible ? (
        <Animated.View
          entering={SlideInUp.duration(180)}
          exiting={SlideOutUp.duration(150)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top, backgroundColor: theme.chrome, borderBottomWidth: 1, borderBottomColor: theme.rule }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 6 }}>
            <Pressable onPress={() => setView("toc")} accessibilityRole="button" accessibilityLabel="Back to contents" style={{ height: 40, flexDirection: "row", alignItems: "center", paddingRight: 12 }}>
              <Icon as={ChevronLeft} size={24} color={theme.ink} />
              <Text className="text-[15px]" style={{ color: theme.ink }}>
                Book
              </Text>
            </Pressable>
            <Text numberOfLines={1} className="mx-2 flex-1 text-center text-[13px] font-medium" style={{ color: theme.muted }}>
              {current.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {[
                { label: "Search book", icon: Search, run: () => setSheet("search") },
                { label: "Themes and settings", icon: Type, run: () => setSheet("settings") },
              ].map((b) => (
                <Pressable key={b.label} onPress={b.run} accessibilityRole="button" accessibilityLabel={b.label} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                  <Icon as={b.icon} size={20} color={theme.ink} />
                </Pressable>
              ))}
              <Pressable onPress={toggleBookmark} accessibilityRole="button" accessibilityLabel={marked ? "Remove bookmark" : "Add bookmark"} accessibilityState={{ selected: !!marked }} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                <Icon as={Bookmark} size={20} color={marked ? theme.accent : theme.ink} fill={marked ? theme.accent : "none"} />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}

      {/* Menu popover */}
      {menuOpen ? (
        <>
          <Pressable onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          <Animated.View
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(100)}
            style={{ position: "absolute", right: 16, bottom: insets.bottom + FOOTER_H + 4, width: 268, borderRadius: 16, overflow: "hidden", backgroundColor: theme.sheet, borderWidth: 1, borderColor: theme.rule }}
          >
            {menuItems.map((it, i) => (
              <Pressable key={it.label} onPress={it.run} accessibilityRole="menuitem" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.rule }}>
                <Text className="text-[15px]" style={{ color: theme.ink }}>
                  {it.label}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {it.count ? (
                    <Text className="text-[13px]" style={{ color: theme.muted }}>
                      {it.count}
                    </Text>
                  ) : null}
                  <Icon as={it.icon} size={17} color={theme.muted} />
                </View>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: theme.rule }}>
              <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share" style={{ flex: 1, alignItems: "center", paddingVertical: 13 }}>
                <Icon as={ShareIcon} size={19} color={theme.ink} />
              </Pressable>
              <Pressable
                onPress={() => {
                  scrollRef.current?.scrollTo({ y: 0, animated: true });
                  setMenuOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Back to start of chapter"
                style={{ flex: 1, alignItems: "center", paddingVertical: 13, borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.rule }}
              >
                <Icon as={ArrowUpToLine} size={19} color={theme.ink} />
              </Pressable>
              <Pressable
                onPress={() => {
                  toggleBookmark();
                  setMenuOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={marked ? "Remove bookmark" : "Add bookmark"}
                style={{ flex: 1, alignItems: "center", paddingVertical: 13 }}
              >
                <Icon as={Bookmark} size={19} color={marked ? theme.accent : theme.ink} fill={marked ? theme.accent : "none"} />
              </Pressable>
            </View>
          </Animated.View>
        </>
      ) : null}

      {/* Sheets */}
      {sheet === "contents" ? (
        <ContentsSheet
          theme={theme}
          chapters={chapters}
          currentId={current.id}
          startPages={startPages}
          bookmarks={bookmarks}
          pageOfBookmark={pageOfBookmark}
          tab={contentsTab}
          onTab={setContentsTab}
          onOpenChapter={(id) => goTo(id, 0)}
          onOpenBookmark={(b) => goTo(b.chapter_id, b.scroll_fraction)}
          onDeleteBookmark={(id) => deleteBookmark.mutate(id)}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "review" ? (
        <ReviewSheet theme={theme} projectId={projectId} bookTitle={title} initialRating={reviewSeed} onClose={() => { setSheet(null); setReviewSeed(undefined); }} />
      ) : null}
      {sheet === "search" ? <SearchSheet theme={theme} chapters={chapters} onOpenHit={(id, f) => goTo(id, f)} onClose={() => setSheet(null)} /> : null}
      {sheet === "settings" ? (
        <SettingsSheet
          theme={theme}
          themeId={themeId}
          onTheme={setThemeId}
          fontSize={fontSize}
          onFontSize={(n) => {
            const next = clampFontSize(n);
            if (next === fontSize) return;
            // Stay on the same sentence while the text reflows (re-applied once the new content height is measured).
            pendingFraction.current = fraction;
            setFontSize(next);
          }}
          font={font}
          onFont={setFontPick}
          spacing={spacing}
          onSpacing={setSpacing}
          justify={justify}
          onJustify={setJustify}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}
