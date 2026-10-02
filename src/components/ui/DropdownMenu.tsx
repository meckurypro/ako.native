// src/components/ui/DropdownMenu.tsx
// Shared three-dot / kebab menu: an anchored panel on the overlay layer.
// Positioned from the trigger's measured window rect (so scroll containers and
// overflow-hidden cards can't clip it), right-aligned to the trigger, and it
// flips upward when there isn't room below.
//
// Render conditionally — `{open && <DropdownMenu … />}` — like every overlay.
//
// `anchorRef` points at the trigger's <View>/<Pressable>. `bottomInset` is the
// height of anything docked at the screen bottom (BottomNav) so "room below"
// means room above that bar; the shell supplies it once built.
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { runAfterDismiss, useBackDismiss } from "@/hooks/useBackDismiss";
import { OverlayPanel, SCRIM_CLASS } from "./OverlayPanel";
import { Portal } from "./Portal";
import { Text } from "./Text";

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  /** e.g. an unread-count pill, rendered flush right */
  badge?: ReactNode;
}

interface DropdownMenuProps {
  anchorRef: RefObject<View | null>;
  items: (DropdownMenuItem | "divider")[];
  onClose: () => void;
  /** Panel width in px (web: w-56 = 224). */
  width?: number;
  /** Height of docked bottom chrome (BottomNav) to keep the menu clear of. */
  bottomInset?: number;
}

const ROW_HEIGHT = 52;
const VIEWPORT_MARGIN = 8;

interface Placement {
  left: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

export function DropdownMenu({ anchorRef, items, onClose, width = 224, bottomInset = 0 }: DropdownMenuProps) {
  useBackDismiss(onClose);
  const insets = useSafeAreaInsets();
  const { width: windowW, height: windowH } = useWindowDimensions();
  const [placement, setPlacement] = useState<Placement | null>(null);
  const measured = useRef(false);

  useLayoutEffect(() => {
    if (measured.current) return;
    anchorRef.current?.measureInWindow((x, y, w, h) => {
      measured.current = true;
      const viewportH = windowH - Math.max(bottomInset, insets.bottom);
      const rowCount = items.filter((i) => i !== "divider").length;
      const desired = Math.min(rowCount * ROW_HEIGHT + 16, 420);

      const spaceBelow = viewportH - (y + h) - VIEWPORT_MARGIN;
      const spaceAbove = y - Math.max(VIEWPORT_MARGIN, insets.top);
      const openUp = spaceBelow < Math.min(desired, 180) && spaceAbove > spaceBelow;

      // Right-align to the trigger, clamped inside the screen.
      const left = Math.min(Math.max(VIEWPORT_MARGIN, x + w - width), windowW - width - VIEWPORT_MARGIN);

      setPlacement({
        left,
        maxHeight: Math.max(160, Math.min(desired, openUp ? spaceAbove : spaceBelow)),
        ...(openUp ? { bottom: windowH - y + 4 } : { top: y + h + 4 }),
      });
    });
  }, [anchorRef, items, windowH, windowW, width, bottomInset, insets.bottom, insets.top]);

  return (
    <Portal zIndex={50}>
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} className={SCRIM_CLASS}>
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button" />
      </Animated.View>

      {placement && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={{ position: "absolute", width, ...placement }}
        >
          <OverlayPanel className="overflow-hidden rounded-2xl py-2" style={{ maxHeight: placement.maxHeight }}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {items.map((item, i) =>
                item === "divider" ? (
                  <View key={`divider-${i}`} className="my-2 h-px bg-overlay-border" />
                ) : (
                  <Pressable
                    key={item.key}
                    accessibilityRole="menuitem"
                    accessibilityState={{ disabled: !!item.disabled }}
                    disabled={item.disabled}
                    onPress={() => runAfterDismiss(onClose, item.onSelect)}
                    className={`flex-row items-center gap-4 px-5 py-3.5 active:bg-overlay-surface-raised ${
                      item.disabled ? "opacity-40" : ""
                    }`}
                  >
                    {/* Fixed-size slot on every row so labels line up whether or not there's an icon. */}
                    <View className="h-6 w-6 shrink-0 items-center justify-center">{item.icon}</View>
                    <Text
                      className={`flex-1 text-base leading-snug ${
                        item.variant === "danger" ? "text-overlay-danger" : "text-overlay-ink"
                      }`}
                    >
                      {item.label}
                    </Text>
                    {item.badge}
                  </Pressable>
                )
              )}
            </ScrollView>
          </OverlayPanel>
        </Animated.View>
      )}
    </Portal>
  );
}
