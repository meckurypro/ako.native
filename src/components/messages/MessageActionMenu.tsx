// src/components/messages/MessageActionMenu.tsx
// Long-press menu for one message — the WhatsApp pattern:
//   • top action bar: Close · Reply · Forward · Copy · Star · Delete · More
//   • a reaction strip (12 emojis, scrollable, + for the full picker) floating
//     above (or below) the message
//   • the message itself lifted onto a highlight, so it's obvious which one it is
// "More" holds Select, Pin, Hide for me, Share outside app.
import { CheckSquare, Copy, EyeOff, Forward, MoreHorizontal, Pin, Plus, Redo2, Reply, Star, Trash2, X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { Portal } from "@/components/ui/Portal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { decodeVoiceNote, VOICE_NOTE_LABEL } from "@/lib/voiceNotes";
import { useTheme } from "@/theme/ThemeProvider";
import type { Rect } from "./ReactionOptionsPopover";

interface MessageActionMenuProps {
  content: string;
  isMine: boolean;
  isDeleted: boolean;
  anchorRect: Rect;
  isStarred: boolean;
  isPinned: boolean;
  /** The reaction strip, in order. */
  emojis: string[];
  myReaction: string | null;
  onReact: (emoji: string) => void;
  onRequestRemoveReaction: () => void;
  onOpenFullPicker: () => void;
  onCopy: () => void;
  onDeletePress: () => void;
  onForward: () => void;
  onReply: () => void;
  onToggleStar: () => void;
  onTogglePin: () => void;
  onHide: () => void;
  onShare: () => void;
  onSelect: () => void;
  onClose: () => void;
}

export function MessageActionMenu({
  content,
  isMine,
  isDeleted,
  anchorRect,
  isStarred,
  isPinned,
  emojis,
  myReaction,
  onReact,
  onRequestRemoveReaction,
  onOpenFullPicker,
  onCopy,
  onDeletePress,
  onForward,
  onReply,
  onToggleStar,
  onTogglePin,
  onHide,
  onShare,
  onSelect,
  onClose,
}: MessageActionMenuProps) {
  useBackDismiss(onClose);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width: windowW } = useWindowDimensions();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<View>(null);
  const [pillSize, setPillSize] = useState<{ width: number; height: number } | null>(null);

  // Place the reaction strip above the message when there's room, else below it.
  let pillTop = 0;
  let pillLeft = 0;
  if (pillSize) {
    pillLeft = Math.min(Math.max(anchorRect.x + anchorRect.width / 2 - pillSize.width / 2, 8), windowW - pillSize.width - 8);
    pillTop = anchorRect.y > pillSize.height + insets.top + 80 ? anchorRect.y - pillSize.height - 14 : anchorRect.y + anchorRect.height + 14;
  }

  const done = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const voice = !isDeleted ? decodeVoiceNote(content) : null;

  const moreItems: (DropdownMenuItem | "divider")[] = [
    { key: "select", label: "Select", icon: <Icon as={CheckSquare} size={22} className="text-overlay-ink" />, onSelect: done(onSelect) },
    ...(!isDeleted
      ? ([
          {
            key: "pin",
            label: isPinned ? "Unpin" : "Pin",
            icon: <Icon as={Pin} size={22} className={isPinned ? "text-overlay-accent" : "text-overlay-ink"} />,
            onSelect: done(onTogglePin),
          },
          { key: "hide", label: "Hide for me", icon: <Icon as={EyeOff} size={22} className="text-overlay-ink" />, onSelect: done(onHide) },
          { key: "share", label: "Share outside app", icon: <Icon as={Redo2} size={22} className="text-overlay-ink" />, onSelect: done(onShare) },
        ] satisfies DropdownMenuItem[])
      : []),
  ];

  const barButton = "p-2";

  return (
    <Portal zIndex={60}>
      <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(100)} className="absolute inset-0 bg-canvas/70">
        <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>

      {/* Top action bar */}
      <View className="absolute inset-x-0 top-0 flex-row items-center gap-1 border-b border-border bg-surface px-2 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" className={barButton}>
          <Icon as={X} size={20} className="text-ink-muted" />
        </Pressable>
        <View className="flex-1" />

        {!isDeleted ? (
          <>
            <Pressable onPress={done(onReply)} accessibilityRole="button" accessibilityLabel="Reply" className={barButton}>
              <Icon as={Reply} size={19} className="text-ink" />
            </Pressable>
            <Pressable onPress={done(onForward)} accessibilityRole="button" accessibilityLabel="Forward" className={barButton}>
              <Icon as={Forward} size={19} className="text-ink" />
            </Pressable>
            <Pressable onPress={done(onCopy)} accessibilityRole="button" accessibilityLabel="Copy" className={barButton}>
              <Icon as={Copy} size={19} className="text-ink" />
            </Pressable>
            <Pressable onPress={done(onToggleStar)} accessibilityRole="button" accessibilityLabel={isStarred ? "Unstar" : "Star"} className={barButton}>
              <Star size={19} color={isStarred ? colors.accent : colors.ink} fill={isStarred ? colors.accent : "none"} />
            </Pressable>
          </>
        ) : null}

        {isMine || isDeleted ? (
          <Pressable onPress={done(onDeletePress)} accessibilityRole="button" accessibilityLabel="Delete" className={barButton}>
            <Icon as={Trash2} size={19} className="text-danger" />
          </Pressable>
        ) : null}

        <View ref={moreButtonRef} collapsable={false}>
          <Pressable onPress={() => setMoreOpen(true)} accessibilityRole="button" accessibilityLabel="More options" className={barButton}>
            <Icon as={MoreHorizontal} size={19} className="text-ink" />
          </Pressable>
        </View>
        {moreOpen ? <DropdownMenu anchorRef={moreButtonRef} onClose={() => setMoreOpen(false)} width={208} zIndex={62} items={moreItems} /> : null}
      </View>

      {/* Reaction strip */}
      {!isDeleted ? (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", top: pillTop, left: pillLeft, maxWidth: windowW - 16, opacity: pillSize ? 1 : 0 }}
          onLayout={(e) => setPillSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        >
          <View
            className="rounded-full border border-border bg-surface"
            style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-1.5 px-2.5 py-2" keyboardShouldPersistTaps="always">
              {emojis.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    if (myReaction === emoji) onRequestRemoveReaction();
                    else onReact(emoji);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`React with ${emoji}`}
                  className={`h-10 w-10 items-center justify-center rounded-full ${myReaction === emoji ? "border-2 border-accent" : ""}`}
                >
                  <Text className="text-[28px] leading-[34px]">{emoji}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={done(onOpenFullPicker)}
                accessibilityRole="button"
                accessibilityLabel="More emoji"
                className="h-9 w-9 items-center justify-center rounded-full border border-border"
              >
                <Icon as={Plus} size={16} className="text-ink-muted" />
              </Pressable>
            </ScrollView>
          </View>
        </View>
      ) : null}

      {/* The message, lifted onto a highlight so it's clear which one this is. */}
      <View
        pointerEvents="none"
        className="absolute rounded-xl bg-accent-soft/60"
        style={{ top: anchorRect.y - 6, left: anchorRect.x - 6, width: anchorRect.width + 12, height: anchorRect.height + 12 }}
      />
      <View pointerEvents="none" style={{ position: "absolute", top: anchorRect.y, left: anchorRect.x, width: anchorRect.width }}>
        <View className={`rounded-2xl px-3 py-2 ${isMine ? "bg-bubble-mine" : "bg-bubble-theirs"} ${isMine ? "rounded-br-md" : "rounded-bl-md"}`}>
          <Text className={`text-sm ${isMine ? "text-white" : "text-ink"} ${isDeleted ? "italic opacity-70" : ""}`}>
            {isDeleted ? "This message was deleted" : voice ? VOICE_NOTE_LABEL : content}
          </Text>
        </View>
      </View>
    </Portal>
  );
}
