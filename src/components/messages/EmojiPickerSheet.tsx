// src/components/messages/EmojiPickerSheet.tsx
// Emoji grid, in two forms:
//   mode "input"    → a panel that REPLACES the keyboard under the composer
//                     (same height as the keyboard, so nothing jumps) with a
//                     backspace key, for typing emoji into the message box
//   mode "reaction" → a bottom sheet for picking a reaction
// Both show "Recently used" first, then every category.
import { Clock, Delete, Hand, Hash, Heart, Lightbulb, PawPrint, Smile, Trophy, Utensils, type LucideIcon } from "lucide-react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";

import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useRecentEmojis } from "@/hooks/useMessageReactions";
import { EMOJI_CATEGORIES } from "@/lib/emojiData";

export { removeLastGrapheme } from "@/lib/graphemes";

const COLUMNS = 8;

const SECTION_ICONS: Record<string, LucideIcon> = {
  recents: Clock,
  smileys: Smile,
  gestures: Hand,
  hearts: Heart,
  animals: PawPrint,
  food: Utensils,
  activities: Trophy,
  objects: Lightbulb,
  symbols: Hash,
};

type GridRow =
  | { kind: "label"; key: string; label: string; section: string }
  | { kind: "row"; key: string; emojis: string[]; section: string };

function useGridRows(): { rows: GridRow[]; sections: { key: string; label: string; labelIndex: number }[] } {
  const recents = useRecentEmojis(36);
  return useMemo(() => {
    const defs = [
      ...(recents.length ? [{ key: "recents", label: "Recently used", chars: recents }] : []),
      ...EMOJI_CATEGORIES.map((c) => ({ key: c.key, label: c.label, chars: c.emojis.map((e) => e.char) })),
    ];
    const rows: GridRow[] = [];
    const sections: { key: string; label: string; labelIndex: number }[] = [];
    for (const section of defs) {
      sections.push({ key: section.key, label: section.label, labelIndex: rows.length });
      rows.push({ kind: "label", key: `l-${section.key}`, label: section.label, section: section.key });
      for (let i = 0; i < section.chars.length; i += COLUMNS) {
        rows.push({ kind: "row", key: `r-${section.key}-${i}`, emojis: section.chars.slice(i, i + COLUMNS), section: section.key });
      }
    }
    return { rows, sections };
  }, [recents]);
}

const VIEWABILITY = { itemVisiblePercentThreshold: 50 };

/**
 * One continuously-scrolling list (Recents, then each category) under a category strip: tap an icon to jump to that
 * section; the active icon follows the scroll.
 */
function PickerBody({ onSelect, trailing }: { onSelect: (emoji: string) => void; trailing?: React.ReactNode }) {
  const { rows, sections } = useGridRows();
  const listRef = useRef<FlashListRef<GridRow>>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = activeKey ?? sections[0]?.key;

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item: GridRow }[] }) => {
    const first = viewableItems[0]?.item;
    if (first) setActiveKey(first.section);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <View className="flex-row items-center border-b border-border px-1">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="always">
          {sections.map((section) => {
            const isActive = active === section.key;
            return (
              <Pressable
                key={section.key}
                onPress={() => {
                  setActiveKey(section.key);
                  void listRef.current?.scrollToIndex({ index: section.labelIndex, animated: true });
                }}
                accessibilityRole="button"
                accessibilityLabel={section.label}
                accessibilityState={{ selected: isActive }}
                className="h-11 min-w-[44px] flex-1 items-center justify-center"
              >
                <Icon as={SECTION_ICONS[section.key] ?? Smile} size={20} className={isActive ? "text-accent" : "text-ink-muted"} />
                <View className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full ${isActive ? "bg-accent" : "bg-transparent"}`} />
              </Pressable>
            );
          })}
        </ScrollView>
        {trailing}
      </View>
      <View style={{ flex: 1 }}>
        <FlashList
          ref={listRef}
          showsHorizontalScrollIndicator={false}
          data={rows}
          keyExtractor={(r) => r.key}
          getItemType={(r) => r.kind}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
          renderItem={({ item }) =>
            item.kind === "label" ? (
              <Text className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{item.label}</Text>
            ) : (
              <View className="flex-row">
                {item.emojis.map((emoji, i) => (
                  <Pressable
                    key={`${emoji}-${i}`}
                    onPress={() => onSelect(emoji)}
                    accessibilityRole="button"
                    accessibilityLabel={emoji}
                    className="aspect-square items-center justify-center rounded-xl active:bg-ink-a10"
                    style={{ width: `${100 / COLUMNS}%` }}
                  >
                    <Text className="text-[28px] leading-[34px]">{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            )
          }
        />
      </View>
    </View>
  );
}

interface EmojiPickerSheetProps {
  onSelect: (emoji: string) => void;
  mode: "input" | "reaction";
  onClose?: () => void;
  /** Input mode: the message text so far (enables the backspace key). */
  content?: string;
  onBackspace?: () => void;
  /** Input mode: panel height in px (the last measured keyboard height). */
  heightPx?: number;
}

export function EmojiPickerSheet({ onSelect, mode, onClose, content = "", onBackspace, heightPx }: EmojiPickerSheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  if (mode === "input") {
    // Never taller than half the screen, so the panel can't push the composer off a short display or sink below it.
    const panelHeight = Math.max(260, Math.min(heightPx ?? 320, Math.round(windowHeight * 0.5)));
    return (
      <View className="border-t border-border bg-surface" style={{ height: panelHeight }}>
        <PickerBody
          onSelect={onSelect}
          trailing={
            <Pressable
              onPress={() => onBackspace?.()}
              disabled={!content}
              accessibilityRole="button"
              accessibilityLabel="Backspace"
              hitSlop={8}
              className={`h-11 w-11 items-center justify-center ${!content ? "opacity-30" : ""}`}
            >
              <Icon as={Delete} size={21} className="text-ink-muted" />
            </Pressable>
          }
        />
      </View>
    );
  }

  return (
    <SheetFrame title="React" onClose={onClose ?? (() => {})} zIndex={65} heightRatio={0.7} bodyScroll={false}>
      <PickerBody onSelect={onSelect} />
    </SheetFrame>
  );
}
