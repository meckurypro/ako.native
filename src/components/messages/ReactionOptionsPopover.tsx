// src/components/messages/ReactionOptionsPopover.tsx
// Opened by tapping a reaction chip that is YOURS: tap it again to remove,
// tap another emoji to replace it, or "+" for the full picker.
import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";

import { OverlayPanel } from "@/components/ui/OverlayPanel";
import { Portal } from "@/components/ui/Portal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useBackDismiss } from "@/hooks/useBackDismiss";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReactionPopoverTarget {
  messageId: string;
  anchorRect: Rect;
  emoji: string;
}

interface ReactionOptionsPopoverProps {
  target: ReactionPopoverTarget;
  quickEmojis: string[];
  onReplace: (emoji: string) => void;
  onOpenFullPicker: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export function ReactionOptionsPopover({ target, quickEmojis, onReplace, onOpenFullPicker, onRemove, onClose }: ReactionOptionsPopoverProps) {
  useBackDismiss(onClose);
  const { width: windowW } = useWindowDimensions();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const others = quickEmojis.filter((e) => e !== target.emoji).slice(0, 5);

  let left = target.anchorRect.x;
  let top = target.anchorRect.y;
  if (size) {
    left = Math.min(Math.max(target.anchorRect.x + target.anchorRect.width / 2 - size.width / 2, 8), windowW - size.width - 8);
    top = target.anchorRect.y > size.height + 16 ? target.anchorRect.y - size.height - 8 : target.anchorRect.y + target.anchorRect.height + 8;
  }

  return (
    <Portal zIndex={66}>
      <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Close" />
      <View
        style={{ position: "absolute", top, left, opacity: size ? 1 : 0 }}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <OverlayPanel className="rounded-2xl py-2">
          <View className="flex-row items-center gap-1 border-b border-overlay-border px-2 pb-2">
            {[target.emoji, ...others].map((emoji, i) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  if (i === 0) onRemove();
                  else onReplace(emoji);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={i === 0 ? `Remove your reaction ${emoji}` : `React with ${emoji}`}
                className={`h-9 w-9 items-center justify-center rounded-full ${i === 0 ? "border-2 border-overlay-accent" : ""}`}
              >
                <Text className="text-xl leading-[26px]">{emoji}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                onOpenFullPicker();
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel="More emoji"
              className="h-9 w-9 items-center justify-center rounded-full"
            >
              <Text className="text-lg text-overlay-ink-muted">+</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              onRemove();
              onClose();
            }}
            accessibilityRole="button"
            className="flex-row items-center gap-2 px-4 pt-2"
          >
            <Icon as={Trash2} size={15} className="text-overlay-danger" />
            <Text className="text-sm text-overlay-danger">Tap to replace or remove</Text>
          </Pressable>
        </OverlayPanel>
      </View>
    </Portal>
  );
}
