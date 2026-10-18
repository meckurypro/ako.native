// src/components/project/book/ReaderSheets.tsx
// The reader's bottom sheets, styled after Apple Books: Contents / Bookmarks, Search Book,
// and Themes & Settings. Colours come from the reader theme (not the app theme) so a sheet
// always matches the page behind it, which is why these don't use the app's SheetFrame.
import { AlignJustify, AlignLeft, Bookmark, ChevronRight, Search, Trash2, X } from "lucide-react-native";
import Slider from "@react-native-community/slider";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { BOOK_SECTION_INFO, type BookBookmark, type BookChapter } from "@/hooks/useBookBuilder";
import { searchChapters } from "@/lib/bookReaderText";
import {
  FONT_STEP,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  READER_THEME_ORDER,
  READER_THEMES,
  relativeDay,
  type LineSpacingId,
  type ReaderFontId,
  type ReaderThemeId,
  type ReaderThemeSpec,
} from "@/lib/bookReaderTheme";
import { haptics } from "@/lib/haptics";


export function chapterLabel(c: BookChapter): string {
  return c.kind === "chapter" ? "Chapter" : BOOK_SECTION_INFO[c.kind].label;
}

const chipBg = (t: ReaderThemeSpec) => (t.dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.07)");

// ---------------------------------------------------------------
// Frame
// ---------------------------------------------------------------

export function Sheet({
  theme,
  title,
  subtitle,
  onClose,
  children,
  tall,
  peek,
}: {
  theme: ReaderThemeSpec;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  tall?: boolean;
  /** While true the sheet turns see-through so the page behind it can be read (text-size slider). */
  peek?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, justifyContent: "flex-end" }} accessibilityViewIsModal>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}>
        <Pressable onPress={onClose} accessibilityLabel="Close" disabled={peek} style={{ flex: 1, backgroundColor: peek ? "transparent" : "rgba(0,0,0,0.38)" }} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View
          entering={SlideInDown.duration(240)}
          exiting={SlideOutDown.duration(180)}
          style={{
            backgroundColor: peek ? "transparent" : theme.sheet,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "88%",
            minHeight: tall ? "62%" : undefined,
            paddingBottom: insets.bottom,
            overflow: "hidden",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, opacity: peek ? 0 : 1 }} pointerEvents={peek ? "none" : "auto"}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text className="text-[17px] font-semibold" style={{ color: theme.ink }}>
                {title}
              </Text>
              {subtitle}
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: chipBg(theme) }}
            >
              <Icon as={X} size={16} color={theme.muted} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Segmented<T extends string>({ theme, items, value, onPick, label }: { theme: ReaderThemeSpec; items: { id: T; label: string }[]; value: T; onPick: (v: T) => void; label?: string }) {
  return (
    <View style={{ marginBottom: label ? 12 : 0 }}>
      {label ? (
        <Text className="mb-1.5 text-xs font-medium" style={{ color: theme.muted }}>
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", borderRadius: 12, padding: 2, backgroundColor: chipBg(theme) }}>
        {items.map((it) => {
          const on = value === it.id;
          return (
            <Pressable
              key={it.id}
              onPress={() => {
                haptics.selection();
                onPick(it.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[{ flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 7 }, on ? { backgroundColor: theme.bg } : null]}
            >
              <Text className="text-[13px] font-semibold" style={{ color: on ? theme.ink : theme.muted }}>
                {it.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------
// Contents + Bookmarks
// ---------------------------------------------------------------

export type ContentsTab = "contents" | "bookmarks";

export function ContentsSheet({
  theme,
  chapters,
  currentId,
  startPages,
  bookmarks,
  pageOfBookmark,
  tab,
  onTab,
  onOpenChapter,
  onOpenBookmark,
  onDeleteBookmark,
  onClose,
}: {
  theme: ReaderThemeSpec;
  chapters: BookChapter[];
  currentId: string | null;
  /** Estimated first page of each chapter, same order as `chapters`. */
  startPages: number[];
  bookmarks: BookBookmark[];
  pageOfBookmark: (b: BookBookmark) => number;
  tab: ContentsTab;
  onTab: (t: ContentsTab) => void;
  onOpenChapter: (id: string) => void;
  onOpenBookmark: (b: BookBookmark) => void;
  onDeleteBookmark: (id: string) => void;
  onClose: () => void;
}) {
  const titles = useMemo(() => new Map(chapters.map((c) => [c.id, c.title])), [chapters]);
  const scrollRef = useRef<ScrollView>(null);
  const rowY = useRef<Record<string, number>>({});

  useEffect(() => {
    if (tab !== "contents" || !currentId) return;
    const t = setTimeout(() => {
      const y = rowY.current[currentId];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, [tab, currentId]);

  return (
    <Sheet theme={theme} title="Contents" onClose={onClose} tall>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 4 }}>
        <Segmented
          theme={theme}
          value={tab}
          onPick={onTab}
          items={[
            { id: "contents", label: "Contents" },
            { id: "bookmarks", label: bookmarks.length > 0 ? `Bookmarks ${bookmarks.length}` : "Bookmarks" },
          ]}
        />
      </View>
      <ScrollView ref={scrollRef} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        {tab === "contents" ? (
          chapters.map((c, i) => {
            const active = c.id === currentId;
            return (
              <Pressable
                key={c.id}
                onLayout={(e) => {
                  rowY.current[c.id] = e.nativeEvent.layout.y;
                }}
                onPress={() => onOpenChapter(c.id)}
                accessibilityRole="button"
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.rule }}
              >
                <View style={{ flex: 1 }}>
                  <Text className="text-[11px] uppercase tracking-wide" style={{ color: theme.muted }}>
                    {chapterLabel(c)}
                  </Text>
                  <Text numberOfLines={1} className={`text-[15px] ${active ? "font-semibold" : "font-medium"}`} style={{ color: active ? theme.accent : theme.ink }}>
                    {c.title}
                  </Text>
                </View>
                <Text className="text-[13px]" style={{ color: theme.muted }}>
                  {startPages[i] ?? ""}
                </Text>
                <Icon as={ChevronRight} size={15} color={theme.muted} />
              </Pressable>
            );
          })
        ) : bookmarks.length === 0 ? (
          <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 56 }}>
            <Icon as={Bookmark} size={26} color={theme.muted} />
            <Text className="text-[15px] font-medium" style={{ color: theme.ink }}>
              No bookmarks yet
            </Text>
            <Text className="text-center text-[13px]" style={{ color: theme.muted }}>
              Tap the bookmark button while you read to save your place.
            </Text>
          </View>
        ) : (
          bookmarks.map((b, i) => (
            <View key={b.id} style={{ flexDirection: "row", alignItems: "center", borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.rule }}>
              <Pressable onPress={() => onOpenBookmark(b)} accessibilityRole="button" style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} className="text-[15px] font-medium" style={{ color: theme.ink }}>
                    {titles.get(b.chapter_id) ?? "Bookmark"}
                  </Text>
                  {b.snippet ? (
                    <Text numberOfLines={1} className="mt-0.5 text-[13px]" style={{ color: theme.muted }}>
                      {b.snippet}
                    </Text>
                  ) : null}
                  <Text className="mt-0.5 text-xs" style={{ color: theme.muted }}>
                    {relativeDay(b.created_at)}
                  </Text>
                </View>
                <Text className="text-[13px]" style={{ color: theme.muted }}>
                  {pageOfBookmark(b)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  haptics.warning();
                  onDeleteBookmark(b.id);
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete bookmark"
                hitSlop={8}
                style={{ width: 40, height: 40, marginRight: 12, alignItems: "center", justifyContent: "center" }}
              >
                <Icon as={Trash2} size={16} color="#D4574A" />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

// ---------------------------------------------------------------
// Search Book
// ---------------------------------------------------------------

export function SearchSheet({
  theme,
  chapters,
  onOpenHit,
  onClose,
}: {
  theme: ReaderThemeSpec;
  chapters: BookChapter[];
  onOpenHit: (chapterId: string, fraction: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(id);
  }, [query]);

  const hits = useMemo(() => searchChapters(chapters, debounced), [chapters, debounced]);
  const titles = useMemo(() => new Map(chapters.map((c) => [c.id, c.title])), [chapters]);

  return (
    <Sheet theme={theme} title="Search Book" onClose={onClose} tall>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, backgroundColor: chipBg(theme) }}>
          <Icon as={Search} size={16} color={theme.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search in this book"
            placeholderTextColor={theme.muted}
            returnKeyType="search"
            autoCorrect={false}
            style={{ flex: 1, paddingVertical: 10, fontSize: 16, color: theme.ink }}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear" hitSlop={10}>
              <Icon as={X} size={15} color={theme.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        {debounced.trim().length < 2 ? (
          <Text className="px-8 py-10 text-center text-[13px]" style={{ color: theme.muted }}>
            Type at least two letters to search every chapter.
          </Text>
        ) : hits.length === 0 ? (
          <Text className="px-8 py-10 text-center text-[14px]" style={{ color: theme.muted }}>
            {`No results for "${debounced.trim()}"`}
          </Text>
        ) : (
          hits.map((h, i) => (
            <Pressable
              key={`${h.chapterId}-${i}`}
              onPress={() => onOpenHit(h.chapterId, h.fraction)}
              accessibilityRole="button"
              style={{ paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.rule }}
            >
              <Text className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: theme.muted }}>
                {titles.get(h.chapterId)}
              </Text>
              <Text className="mt-0.5 text-[14px]" style={{ color: theme.ink, lineHeight: 20 }}>
                {h.before}
                <Text className="font-semibold" style={{ backgroundColor: `${theme.accent}40`, color: theme.ink }}>
                  {h.match}
                </Text>
                {h.after}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

// ---------------------------------------------------------------
// Themes & Settings
// ---------------------------------------------------------------

const SPACING: { id: LineSpacingId; label: string }[] = [
  { id: "tight", label: "Tight" },
  { id: "normal", label: "Normal" },
  { id: "loose", label: "Loose" },
];
const FONTS: { id: ReaderFontId; label: string }[] = [
  { id: "serif", label: "Serif" },
  { id: "sans", label: "Sans" },
  { id: "display", label: "Display" },
];

export function SettingsSheet({
  theme,
  themeId,
  onTheme,
  fontSize,
  onFontSize,
  font,
  onFont,
  spacing,
  onSpacing,
  justify,
  onJustify,
  onClose,
}: {
  theme: ReaderThemeSpec;
  themeId: ReaderThemeId;
  onTheme: (t: ReaderThemeId) => void;
  fontSize: number;
  onFontSize: (n: number) => void;
  font: ReaderFontId;
  onFont: (f: ReaderFontId) => void;
  spacing: LineSpacingId;
  onSpacing: (s: LineSpacingId) => void;
  justify: boolean;
  onJustify: (j: boolean) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState(false);
  const [peek, setPeek] = useState(false);
  const chip = chipBg(theme);
  const fadeStyle = { opacity: peek ? 0 : 1 } as const;
  const tickCount = Math.round((MAX_FONT_SIZE - MIN_FONT_SIZE) / FONT_STEP) + 1;

  return (
    <Sheet
      theme={theme}
      title="Themes & Settings"
      onClose={onClose}
      peek={peek}
      subtitle={
        <Pressable onPress={() => setOptions((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: options }} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
          <Text className="text-[13px]" style={{ color: theme.muted }}>
            {READER_THEMES[themeId].label}
          </Text>
          <Text className="text-[13px] font-semibold" style={{ color: theme.ink }}>
            Options
          </Text>
          <View style={{ transform: [{ rotate: options ? "90deg" : "0deg" }] }}>
            <Icon as={ChevronRight} size={13} color={theme.ink} />
          </View>
        </Pressable>
      }
    >
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {/* Text size. Hold the thumb and the sheet turns see-through so you can watch the page reflow. */}
          <View
            style={{
              flex: 1,
              height: 48,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              gap: 8,
              backgroundColor: peek ? theme.sheet : chip,
              borderWidth: peek ? 1 : 0,
              borderColor: theme.rule,
              shadowColor: "#000",
              shadowOpacity: peek ? 0.28 : 0,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: peek ? 8 : 0,
            }}
          >
            <Text className="text-[13px] font-semibold" style={{ color: theme.ink }}>
              A
            </Text>
            <View style={{ flex: 1, justifyContent: "center" }}>
              <View pointerEvents="none" style={{ position: "absolute", left: 10, right: 10, flexDirection: "row", justifyContent: "space-between" }}>
                {Array.from({ length: tickCount }).map((_, i) => (
                  <View key={i} style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: MIN_FONT_SIZE + i * FONT_STEP <= fontSize ? theme.ink : theme.muted, opacity: 0.55 }} />
                ))}
              </View>
              <Slider
                minimumValue={MIN_FONT_SIZE}
                maximumValue={MAX_FONT_SIZE}
                step={FONT_STEP}
                value={fontSize}
                onSlidingStart={() => setPeek(true)}
                onValueChange={(v) => {
                  if (v === fontSize) return;
                  haptics.selection();
                  onFontSize(v);
                }}
                onSlidingComplete={() => setPeek(false)}
                minimumTrackTintColor={theme.ink}
                maximumTrackTintColor={theme.rule}
                thumbTintColor={theme.ink}
                accessibilityLabel="Text size"
                accessibilityValue={{ min: MIN_FONT_SIZE, max: MAX_FONT_SIZE, now: fontSize, text: `${fontSize} points` }}
                style={{ height: 40 }}
              />
            </View>
            <Text className="text-[24px] font-semibold" style={{ color: theme.ink }}>
              A
            </Text>
          </View>
          <Pressable
            onPress={() => {
              haptics.selection();
              onJustify(!justify);
            }}
            accessibilityRole="button"
            accessibilityLabel={justify ? "Left-align text" : "Justify text"}
            accessibilityState={{ selected: justify }}
            style={{ width: 56, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: justify ? theme.ink : chip, ...fadeStyle }}
            disabled={peek}
          >
            <Icon as={justify ? AlignJustify : AlignLeft} size={18} color={justify ? theme.bg : theme.ink} />
          </Pressable>
        </View>

        <View style={fadeStyle} pointerEvents={peek ? "none" : "auto"}>
        {options && (
          <View style={{ marginTop: 4, marginBottom: 4 }}>
            <Segmented theme={theme} label="Font" items={FONTS} value={font} onPick={onFont} />
            <Segmented theme={theme} label="Line spacing" items={SPACING} value={spacing} onPick={onSpacing} />
          </View>
        )}

        <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginTop: 4 }}>
          {READER_THEME_ORDER.map((id) => {
            const t = READER_THEMES[id];
            const selected = id === themeId;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  haptics.selection();
                  onTheme(id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{ width: "33.333%", paddingHorizontal: 5, paddingBottom: 10, alignItems: "center" }}
              >
                <View
                  style={{
                    width: "100%",
                    height: 62,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: t.bg,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? theme.ink : theme.rule,
                  }}
                >
                  <Text className={`font-reading ${t.heavy ? "font-extrabold" : "font-medium"}`} style={{ fontSize: 24, color: t.ink }}>Aa</Text>
                </View>
                <Text className="mt-1.5 text-xs font-medium" style={{ color: selected ? theme.ink : theme.muted }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        </View>
      </ScrollView>
    </Sheet>
  );
}
