// src/components/messages/EmojiPickerSheet.tsx
// Emoji grid, in two forms:
//   mode "input"    → a panel that REPLACES the keyboard under the composer
//                     (same height as the keyboard, so nothing jumps) with a
//                     backspace key, for typing emoji into the message box
//   mode "reaction" → a bottom sheet for picking a reaction
// Both show "Recently used" first, then every category.
import { Delete } from "lucide-react-native";
import { FlashList } from "@shopify/flash-list";
import { useMemo } from "react";
import { Pressable, View } from "react-native";

import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useRecentEmojis } from "@/hooks/useMessageReactions";
import { EMOJI_CATEGORIES } from "@/lib/emojiData";

export { removeLastGrapheme } from "@/lib/graphemes";

const COLUMNS = 8;

type GridRow = { kind: "label"; key: string; label: string } | { kind: "row"; key: string; emojis: string[] };

function useGridRows(): GridRow[] {
  const recents = useRecentEmojis(36);
  return useMemo(() => {
    const sections = [
      ...(recents.length ? [{ key: "recents", label: "Recently used", chars: recents }] : []),
      ...EMOJI_CATEGORIES.map((c) => ({ key: c.key, label: c.label, chars: c.emojis.map((e) => e.char) })),
    ];
    const rows: GridRow[] = [];
    for (const section of sections) {
      rows.push({ kind: "label", key: `l-${section.key}`, label: section.label });
      for (let i = 0; i < section.chars.length; i += COLUMNS) {
        rows.push({ kind: "row", key: `r-${section.key}-${i}`, emojis: section.chars.slice(i, i + COLUMNS) });
      }
    }
    return rows;
  }, [recents]);
}

function Grid({ onSelect }: { onSelect: (emoji: string) => void }) {
  const rows = useGridRows();
  return (
    <FlashList
      data={rows}
      keyExtractor={(r) => r.key}
      getItemType={(r) => r.kind}
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
      renderItem={({ item }) =>
        item.kind === "label" ? (
          <Text className="px-1 pb-1 pt-3 text-xs text-ink-muted">{item.label}</Text>
        ) : (
          <View className="flex-row">
            {item.emojis.map((emoji, i) => (
              <Pressable
                key={`${emoji}-${i}`}
                onPress={() => onSelect(emoji)}
                accessibilityRole="button"
                accessibilityLabel={emoji}
                className="aspect-square items-center justify-center rounded-lg active:opacity-50"
                style={{ width: `${100 / COLUMNS}%` }}
              >
                <Text className="text-[28px] leading-[34px]">{emoji}</Text>
              </Pressable>
            ))}
          </View>
        )
      }
    />
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
  if (mode === "input") {
    return (
      <View className="border-t border-border bg-surface" style={{ height: heightPx ?? 320 }}>
        <View className="flex-row items-center justify-end px-3 pb-1 pt-2">
          <Pressable
            onPress={() => onBackspace?.()}
            disabled={!content}
            accessibilityRole="button"
            accessibilityLabel="Backspace"
            hitSlop={8}
            className={`p-2 ${!content ? "opacity-30" : ""}`}
          >
            <Icon as={Delete} size={20} className="text-ink-muted" />
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Grid onSelect={onSelect} />
        </View>
      </View>
    );
  }

  return (
    <SheetFrame title="React" onClose={onClose ?? (() => {})} zIndex={65} heightRatio={0.7} bodyScroll={false}>
      <Grid onSelect={onSelect} />
    </SheetFrame>
  );
}
