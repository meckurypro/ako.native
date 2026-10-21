// src/components/ui/Sheet.tsx
// The shared shell behind every picker / form sheet (GiftPicker, ManageAccessSheet, CommentReportSheet, SheetFrame…).
//
// No longer a bottom-docked panel: it is a centred card, the same family as Modal and OptionsModal. It opens centred
// on the screen from its natural height, and then its TOP EDGE STAYS PUT — if the content grows the card extends
// downward until it nears the bottom nav, after which the body scrolls (see useAnchoredPanel). Sheets with a fixed
// `heightRatio` (comments) are simply centred at that height.
//
//   • fades / scales in and out; Android Back and scrim tap dismiss, always through the exit animation
//   • keeps content above the keyboard and shrinks to the room it leaves (sheets with inputs)
//
// Render conditionally — `{open && <Sheet … />}` — like every overlay.
// Children can call `useSheet().close()` to dismiss WITH the animation (use it from row handlers); calling the
// parent's onClose directly also works, it just skips the exit animation.
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Keyboard, Pressable, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { useAnchoredPanel } from "@/hooks/useAnchoredPanel";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { GlassScrim } from "./GlassScrim";
import type { ScrimTone } from "./OverlayPanel";
import { Portal } from "./Portal";

interface SheetContextValue {
  /** Dismiss with the slide-out animation, then call the sheet's onClose. */
  close: () => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function useSheet(): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("useSheet must be used within a <Sheet>");
  return ctx;
}

interface SheetProps {
  onClose: () => void;
  children: ReactNode;
  /** Ignored — sheets are centred cards now and no longer drag. Kept so existing call sites compile. */
  dragZone?: "sheet" | "handle";
  /** Ignored — there is no grabber on a centred card. Kept so existing call sites compile. */
  showHandle?: boolean;
  /** Fraction of the screen height the panel may occupy (default 0.9). */
  maxHeightRatio?: number;
  /** Fixed panel height as a fraction of the screen (comments: 0.82). Content then fills it. */
  heightRatio?: number;
  /** Ignored — every card uses the same radius. Kept so existing call sites compile. */
  radius?: "2xl" | "3xl";
  /**
   * Lift above the keyboard and shrink to the room it leaves. On by default — any sheet can end up
   * hosting an input (search boxes, amounts, quotes), and a no-op when the keyboard is hidden.
   */
  avoidKeyboard?: boolean;
  /**
   * Option / action sheets (pick one, confirm, menu rows): hide the soft keyboard when the sheet opens so the
   * options aren't crowded by it. Leave off for sheets that host an input.
   */
  dismissKeyboardOnOpen?: boolean;
  /** Layer tier; default 50 (modals are 60). */
  zIndex?: number;
  /** Backdrop tint, matching the web sheet it mirrors (default canvas/70). */
  scrim?: ScrimTone;
  /**
   * Multi-step sheets: Android Back runs this instead of closing the sheet (e.g. confirm → catalogue).
   * Registered by the Sheet itself because child effects mount before the Sheet's own, so a handler
   * registered inside the body would sit UNDER the sheet's close handler and never run.
   */
  onBackStep?: () => void;
  accessibilityLabel?: string;
}

const MAX_WIDTH = 448;
const ANIM_MS = 180;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export function Sheet({
  onClose,
  children,
  heightRatio,
  maxHeightRatio = 0.9,
  avoidKeyboard = true,
  dismissKeyboardOnOpen = false,
  zIndex = 50,
  scrim = "canvas",
  onBackStep,
  accessibilityLabel,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  useEffect(() => {
    if (dismissKeyboardOnOpen) Keyboard.dismiss();
  }, [dismissKeyboardOnOpen]);

  // 0 = hidden, 1 = shown.
  const progress = useSharedValue(0);
  const closing = useSharedValue(false);
  useEffect(() => {
    progress.value = withTiming(1, { duration: ANIM_MS, easing: EASE });
  }, [progress]);

  const finish = useCallback(() => onClose(), [onClose]);

  const close = useCallback(() => {
    if (closing.value) return;
    closing.value = true;
    progress.value = withTiming(0, { duration: ANIM_MS - 40, easing: EASE }, (done) => {
      if (done) scheduleOnRN(finish);
    });
  }, [closing, finish, progress]);

  useBackDismiss(onBackStep ?? close);

  // Centred and top-anchored placement (variable-height sheets); fixed-height sheets are plainly centred.
  const anchored = useAnchoredPanel();

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const hostStyle = useAnimatedStyle(() => ({ paddingBottom: avoidKeyboard ? keyboard.height.value : 0 }));
  const fixedSizeStyle = useAnimatedStyle(() => {
    const room = windowH - (avoidKeyboard ? keyboard.height.value : 0) - insets.top - insets.bottom - 32;
    return heightRatio ? { height: Math.min(windowH * heightRatio, room) } : { maxHeight: Math.min(windowH * maxHeightRatio, room) };
  });
  const cardAnim = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.96 + 0.04 * progress.value }],
  }));

  const panel = (
    <Animated.View
      style={[{ width: "100%", maxWidth: MAX_WIDTH, flexShrink: 1 }, heightRatio ? fixedSizeStyle : anchored.style, cardAnim]}
      onLayout={heightRatio ? undefined : anchored.onLayout}
      className="overflow-hidden rounded-[28px] border border-border bg-surface"
    >
      <Animated.View style={{ flex: heightRatio ? 1 : undefined, flexShrink: 1 }}>{children}</Animated.View>
    </Animated.View>
  );

  const ctx = useMemo(() => ({ close }), [close]);

  return (
    <Portal zIndex={zIndex}>
      <SheetContext.Provider value={ctx}>
        <Animated.View
          className={`flex-1 items-center px-6 ${heightRatio ? "justify-center" : "justify-start"}`}
          style={hostStyle}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
        >
          <Animated.View className="absolute inset-0" style={scrimStyle}>
            <GlassScrim tone={scrim} />
            <Pressable className="flex-1" onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
          </Animated.View>

          {panel}
        </Animated.View>
      </SheetContext.Provider>
    </Portal>
  );
}
