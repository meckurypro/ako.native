// src/components/post/FormatToolbar.tsx
// Bold / italic / strikethrough / underline buttons that wrap the current
// selection in the WhatsApp-style markers formatText.tsx understands.
import { Bold, Italic, Strikethrough, Underline } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";

type MarkKind = "bold" | "italic" | "strike" | "underline";

const MARKERS: Record<MarkKind, { before: string; after: string; label: string; icon: LucideIcon }> = {
  bold: { before: "*", after: "*", label: "Bold", icon: Bold },
  italic: { before: "_", after: "_", label: "Italic", icon: Italic },
  strike: { before: "~", after: "~", label: "Strikethrough", icon: Strikethrough },
  underline: { before: "[u]", after: "[/u]", label: "Underline", icon: Underline },
};

export interface Selection {
  start: number;
  end: number;
}

interface FormatToolbarProps {
  value: string;
  selection: Selection;
  onChange: (value: string) => void;
  /** Move the caret (the editor applies it to the TextInput). */
  onSelect: (selection: Selection) => void;
  className?: string;
}

export function FormatToolbar({ value, selection, onChange, onSelect, className }: FormatToolbarProps) {
  function applyMark(kind: MarkKind) {
    const { before, after } = MARKERS[kind];
    const start = Math.min(selection.start, value.length);
    const end = Math.min(selection.end, value.length);
    const selected = value.slice(start, end);
    onChange(`${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`);

    // Caret lands after the closing marker when text was wrapped, or between
    // the markers when nothing was selected so the user can just start typing.
    const cursor = selected ? start + before.length + selected.length + after.length : start + before.length;
    onSelect({ start: cursor, end: cursor });
  }

  return (
    <View className={`flex-row items-center gap-1 ${className ?? ""}`}>
      {(Object.keys(MARKERS) as MarkKind[]).map((kind) => {
        const { label, icon } = MARKERS[kind];
        return (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => applyMark(kind)}
            hitSlop={4}
            className="rounded-lg p-1.5 active:bg-surface"
          >
            <Icon as={icon} size={15} className="text-ink-muted" />
          </Pressable>
        );
      })}
    </View>
  );
}
