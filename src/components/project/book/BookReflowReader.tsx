// src/components/project/book/BookReflowReader.tsx
// Reader for authored (text) books: table of contents → chapter view with
// light / sepia / dark themes and adjustable text size. Reading position
// (chapter + scroll fraction) is saved to the server, debounced.
import Slider from "@react-native-community/slider";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, ChevronLeft, ChevronRight, Settings2, Sun } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeedDoorway } from "@/components/project/FeedDoorway";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { BOOK_SECTION_INFO, useBookProgress, useSaveBookProgress, type BookChapter } from "@/hooks/useBookBuilder";
import { useFeedDoorway } from "@/hooks/useFeedDoorway";
import { haptics } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type ReaderTheme = "light" | "sepia" | "dark";
const THEMES: ReaderTheme[] = ["light", "sepia", "dark"];

const THEME_BG: Record<ReaderTheme, string> = { light: "#F7F4EF", sepia: "#EFE4CC", dark: "#17140F" };
const THEME_INK: Record<ReaderTheme, string> = { light: "#1F1D1A", sepia: "#3A2E1F", dark: "#F0EEE8" };
const THEME_INK_MUTED: Record<ReaderTheme, string> = { light: "#6B6558", sepia: "#7A6444", dark: "#9C978A" };

const THEME_KEY = "ako-reader-theme";
const SIZE_KEY = "ako-reader-font-size";
const MIN_SIZE = 13;
const MAX_SIZE = 28;
const SAVE_DEBOUNCE_MS = 900;

function readTheme(): ReaderTheme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "sepia" || stored === "dark" || stored === "light" ? stored : "light";
}
function readSize(): number {
  const n = Number(localStorage.getItem(SIZE_KEY));
  return n >= MIN_SIZE && n <= MAX_SIZE ? n : 17;
}

interface BookReflowReaderProps {
  projectId: string;
  title: string;
  chapters: BookChapter[];
  userId: string | undefined;
}

export function BookReflowReader({ projectId, title, chapters, userId }: BookReflowReaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data: progress } = useBookProgress(projectId, userId);
  const saveProgress = useSaveBookProgress(projectId, userId);
  const bookDoorway = useFeedDoorway("book");

  const [view, setView] = useState<"toc" | "chapter">("toc");
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ReaderTheme>(readTheme);
  const [fontSize, setFontSize] = useState<number>(readSize);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resumed, setResumed] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportH = useRef(0);
  const contentH = useRef(0);
  // Fraction to jump to once the chapter has laid out (resuming where the reader left off).
  const pendingFraction = useRef<number | null>(null);

  useEffect(() => localStorage.setItem(THEME_KEY, theme), [theme]);
  useEffect(() => localStorage.setItem(SIZE_KEY, String(fontSize)), [fontSize]);
  useEffect(() => () => void (saveTimer.current && clearTimeout(saveTimer.current)), []);

  // Resume: reopen the last chapter, at the saved scroll position.
  useEffect(() => {
    if (resumed || chapters.length === 0) return;
    if (progress?.current_chapter_id && chapters.some((c) => c.id === progress.current_chapter_id)) {
      pendingFraction.current = progress.scroll_fraction ?? null;
      setChapterId(progress.current_chapter_id);
      setView("chapter");
    }
    setResumed(true);
  }, [resumed, chapters, progress]);

  const currentIndex = chapters.findIndex((c) => c.id === chapterId);
  const current = currentIndex >= 0 ? chapters[currentIndex] : null;
  const prev = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  // Android back: leave the chapter for the contents list, not the whole book.
  useBackDismiss(() => setView("toc"), view === "chapter" && !settingsOpen);

  function openChapter(id: string) {
    haptics.selection();
    pendingFraction.current = null;
    setChapterId(id);
    setView("chapter");
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  const applyPendingScroll = useCallback(() => {
    const fraction = pendingFraction.current;
    if (fraction == null || viewportH.current === 0 || contentH.current === 0) return;
    const range = contentH.current - viewportH.current;
    if (range <= 0) return;
    pendingFraction.current = null;
    scrollRef.current?.scrollTo({ y: fraction * range, animated: false });
  }, []);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!current) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const range = contentSize.height - layoutMeasurement.height;
    const fraction = range > 0 ? Math.min(1, Math.max(0, contentOffset.y / range)) : 0;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const chapterToSave = current.id;
    saveTimer.current = setTimeout(() => saveProgress.mutate({ chapterId: chapterToSave, scrollFraction: fraction }), SAVE_DEBOUNCE_MS);
  }

  if (view === "toc" || !current) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title={title} bar />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
          <View className="gap-1">
            {chapters.map((c) => (
              <Pressable key={c.id} onPress={() => openChapter(c.id)} accessibilityRole="button" className="flex-row items-center justify-between rounded-xl px-3 py-3 active:bg-surface">
                <View className="min-w-0 flex-1">
                  <Text className="text-xs uppercase tracking-wide text-ink-muted">{c.kind === "chapter" ? "Chapter" : BOOK_SECTION_INFO[c.kind].label}</Text>
                  <Text className="text-sm font-medium text-ink">{c.title}</Text>
                </View>
                <Icon as={ChevronRight} size={16} className="text-ink-muted" />
              </Pressable>
            ))}
            {bookDoorway.visible && <FeedDoorway context="book" onEnter={bookDoorway.markEnteredFeed} />}
          </View>
        </ScrollView>
      </View>
    );
  }

  const ink = THEME_INK[theme];
  const muted = THEME_INK_MUTED[theme];

  return (
    <View className="flex-1" style={{ backgroundColor: THEME_BG[theme] }}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <View className="flex-row items-center justify-between px-3 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <Pressable onPress={() => setView("toc")} accessibilityRole="button" accessibilityLabel="Contents" hitSlop={12}>
          <Icon as={ArrowLeft} size={22} color={ink} />
        </Pressable>
        <Text numberOfLines={1} className="max-w-[55%] text-sm font-medium" style={{ color: ink }}>
          {current.title}
        </Text>
        <Pressable onPress={() => setSettingsOpen(true)} accessibilityRole="button" accessibilityLabel="Reading settings" hitSlop={12}>
          <Icon as={Settings2} size={20} color={ink} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        // Remount per chapter so scroll offset and layout start clean.
        key={current.id}
        onScroll={handleScroll}
        scrollEventThrottle={64}
        onLayout={(e: LayoutChangeEvent) => {
          viewportH.current = e.nativeEvent.layout.height;
          applyPendingScroll();
        }}
        onContentSizeChange={(_w, h) => {
          contentH.current = h;
          applyPendingScroll();
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 80 }}
      >
        <Text className="mb-4 font-semibold" style={{ color: ink, fontSize: fontSize + 8, lineHeight: (fontSize + 8) * 1.3 }}>
          {current.title}
        </Text>
        {current.content ? (
          <Text selectable style={{ color: ink, fontSize, lineHeight: fontSize * 1.625 }}>
            {current.content}
          </Text>
        ) : (
          <Text style={{ color: muted, fontSize }}>Nothing here yet.</Text>
        )}

        <View className="mb-6 mt-10 flex-row items-center justify-between">
          <Pressable onPress={() => prev && openChapter(prev.id)} disabled={!prev} accessibilityRole="button" hitSlop={8} className={`flex-row items-center gap-1 ${prev ? "" : "opacity-30"}`}>
            <Icon as={ChevronLeft} size={16} color={ink} />
            <Text className="text-sm font-medium" style={{ color: ink }}>
              Previous
            </Text>
          </Pressable>
          <Pressable onPress={() => next && openChapter(next.id)} disabled={!next} accessibilityRole="button" hitSlop={8} className={`flex-row items-center gap-1 ${next ? "" : "opacity-30"}`}>
            <Text className="text-sm font-medium" style={{ color: ink }}>
              Next
            </Text>
            <Icon as={ChevronRight} size={16} color={ink} />
          </Pressable>
        </View>
      </ScrollView>

      {settingsOpen && (
        <SheetFrame title="Reading settings" onClose={() => setSettingsOpen(false)}>
          <View className="px-5 pb-6 pt-4">
            <Text className="mb-2 text-xs font-medium text-ink-muted">Theme</Text>
            <View className="mb-5 flex-row gap-2">
              {THEMES.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => {
                    haptics.selection();
                    setTheme(t);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: theme === t }}
                  className={`flex-1 items-center rounded-xl border py-2.5 ${theme === t ? "border-accent bg-accent-soft" : "border-border"}`}
                  style={theme === t ? undefined : { backgroundColor: THEME_BG[t] }}
                >
                  <Text className={`text-sm font-medium capitalize ${theme === t ? "text-ink" : ""}`} style={theme === t ? undefined : { color: THEME_INK_MUTED[t] }}>
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="mb-2 flex-row items-center gap-1.5">
              <Icon as={Sun} size={13} className="text-ink-muted" />
              <Text className="text-xs font-medium text-ink-muted">Text size</Text>
            </View>
            <Slider
              minimumValue={MIN_SIZE}
              maximumValue={MAX_SIZE}
              step={1}
              value={fontSize}
              onValueChange={setFontSize}
              minimumTrackTintColor={colors.accent}
              thumbTintColor={colors.accent}
              accessibilityLabel="Text size"
            />
          </View>
        </SheetFrame>
      )}
    </View>
  );
}
