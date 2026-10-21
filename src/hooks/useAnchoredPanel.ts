// src/hooks/useAnchoredPanel.ts
// Placement for every centred overlay card (Modal, OptionsModal, DropdownMenu). Port of the web hook of the same name.
//
// The card is centred on open from its natural height, and then its TOP EDGE STAYS PUT. If the content later grows the
// card extends downward — never upward — until it nears the bottom navigation bar (or the screen's bottom margin where
// there isn't one), after which its body scrolls. The keyboard, when open, pushes the card to the top and caps its
// height above the keyboard instead.
import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { usePathname } from "expo-router";
import { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { showsBottomNav } from "@/components/nav/routes";
import { useKeyboardHeight } from "@/components/ui/KeyboardAvoider";

const EDGE = 16;
const MIN_AVAILABLE = 120;
/** Matches useBottomNavInset(): the nav is at least 72dp tall plus the bottom safe area. */
const NAV_MIN = 72;

export function useAnchoredPanel() {
  const { width: windowW, height: windowH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const keyboard = useKeyboardHeight();

  const topLimit = insets.top + EDGE;
  const bottomReserve = showsBottomNav(pathname) ? NAV_MIN + insets.bottom + 12 : insets.bottom + EDGE;
  const available = Math.max(MIN_AVAILABLE, windowH - topLimit - bottomReserve);

  // The frozen top edge. null = not measured yet (card is laid out invisibly to read its natural height).
  const [top, setTop] = useState<number | null>(null);
  const measuredKey = useRef("");
  const key = `${windowW}x${windowH}:${available}`;

  // Rotation / split-screen changes the room available: measure again from scratch.
  useEffect(() => {
    if (measuredKey.current && measuredKey.current !== key) {
      measuredKey.current = "";
      setTop(null);
    }
  }, [key]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (measuredKey.current) return; // the top edge is frozen once measured
      const natural = e.nativeEvent.layout.height;
      if (natural <= 0) return;
      measuredKey.current = key;
      setTop(Math.round(topLimit + (available - Math.min(natural, available)) / 2));
    },
    [key, topLimit, available]
  );

  const measured = top !== null;
  const style = useAnimatedStyle(() => {
    const kb = keyboard.value;
    if (kb > 0) {
      // Keyboard up: ride at the top and fit above it.
      return {
        marginTop: topLimit,
        maxHeight: Math.max(MIN_AVAILABLE, windowH - kb - topLimit - EDGE),
        opacity: measured ? 1 : 0,
      };
    }
    const t = top ?? topLimit;
    return {
      marginTop: t,
      // Until measured the card may take all the room, so its natural height can be read.
      maxHeight: measured ? Math.max(MIN_AVAILABLE, windowH - t - bottomReserve) : available,
      opacity: measured ? 1 : 0,
    };
  });

  return { style, onLayout };
}
