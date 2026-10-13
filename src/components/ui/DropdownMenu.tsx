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
import { VariableContextProvider } from "nativewind";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { runAfterDismiss, useBackDismiss } from "@/hooks/useBackDismiss";
import { overlay, paletteToCssVars } from "@/theme/palettes";
import { useTheme } from "@/theme/ThemeProvider";
import { OverlayPanel, SCRIM_STYLE } from "./OverlayPanel";
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
  /** Overlay layer (default 50). Raise it when opening from inside another overlay. */
  zIndex?: number;
}

const ROW_HEIGHT = 52;
const VIEWPORT_MARGIN = 8;

interface Placement {
  left: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

export function DropdownMenu({ anchorRef, items, onClose, width = 224, bottomInset = 0, zIndex = 50 }: DropdownMenuProps) {
  useBackDismiss(onClose);
  const { colors, resolvedTheme } = useTheme();
  const insets = useSafeAreaInsets();

  // Light mode: light panel, dark text and icons. Dark mode keeps the
  // fixed dark-glass overlay chrome (same as web's .ako-overlay-panel).
  const light = resolvedTheme === "light";
  const menu = light
    ? { bg: `${colors.surface}F5`, border: colors.border, ink: colors.ink, danger: colors.danger, pressed: `${colors.ink}0F`, shadowOpacity: 0.18 }
    : { bg: `${overlay.surface}F5`, border: overlay.border, ink: overlay.ink, danger: overlay.danger, pressed: overlay.surfaceRaised, shadowOpacity: 0.5 };
  // Callers colour their icons with text-overlay-ink / text-overlay-danger classes.
  // Re-point those tokens inside the panel so the icons follow the light panel too.
  const iconVars = useMemo(
    () => ({
      ...paletteToCssVars(colors),
      ...(light
        ? {
            "--color-overlay-ink": colors.ink,
            "--color-overlay-ink-muted": colors.inkMuted,
            "--color-overlay-danger": colors.danger,
            "--color-overlay-border": colors.border,
            "--color-overlay-surface-raised": `${colors.ink}0F`,
            "--color-overlay-accent": colors.accent,
          }
        : {}),
    }),
    [colors, light]
  );
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
    <Portal zIndex={zIndex}>
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} style={SCRIM_STYLE}>
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button" />
      </Animated.View>

      {placement && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={{ position: "absolute", width, ...placement }}
        >
          <OverlayPanel
            className="overflow-hidden rounded-2xl py-2"
            style={{ maxHeight: placement.maxHeight, backgroundColor: menu.bg, borderColor: menu.border, shadowOpacity: menu.shadowOpacity }}
          >
            <VariableContextProvider value={iconVars}>
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                {items.map((item, i) =>
                  item === "divider" ? (
                    <View key={`divider-${i}`} style={{ height: 1, marginVertical: 8, backgroundColor: menu.border }} />
                  ) : (
                    <Pressable
                      key={item.key}
                      accessibilityRole="menuitem"
                      accessibilityState={{ disabled: !!item.disabled }}
                      disabled={item.disabled}
                      onPress={() => runAfterDismiss(onClose, item.onSelect)}
                      className={`flex-row items-center gap-4 px-5 py-3.5 ${item.disabled ? "opacity-40" : ""}`}
                      style={({ pressed }) => ({ backgroundColor: pressed ? menu.pressed : "transparent" })}
                    >
                      {/* Fixed-size slot on every row so labels line up whether or not there's an icon. */}
                      <View className="h-6 w-6 shrink-0 items-center justify-center">{item.icon}</View>
                      <Text
                        className="flex-1 text-base leading-snug"
                        style={{ color: item.variant === "danger" ? menu.danger : menu.ink }}
                      >
                        {item.label}
                      </Text>
                      {item.badge}
                    </Pressable>
                  )
                )}
              </ScrollView>
            </VariableContextProvider>
          </OverlayPanel>
        </Animated.View>
      )}
    </Portal>
  );
}
