// src/components/ui/Sheet.tsx
// Bottom sheet — the shared shell behind every action sheet and picker
// (ConversationActionSheet, DeleteMessageSheet, ReactionMoreSheet, GiftPicker,
// ManageAccessSheet, CommentReportSheet…). Matches the web chrome: canvas scrim,
// surface panel with rounded top corners and a top border, safe-area padding.
//
// Native behaviour on top of that:
//   • slides up / down, tracks the finger, swipe down (or flick) to dismiss
//   • Android Back and scrim tap dismiss, always through the slide-out
//   • keeps content above the keyboard and shrinks to the room it leaves (sheets with inputs)
//
// Render conditionally — `{open && <Sheet … />}` — like every overlay.
// Children can call `useSheet().close()` to dismiss WITH the animation (use it
// from row handlers); calling the parent's onClose directly also works, it just
// skips the slide-out.
//
// Drag zone: by default the whole panel drags (right for short action sheets).
// For sheets whose content scrolls, pass dragZone="handle" and only the small
// grabber at the top starts a drag, so the inner list keeps its own scrolling.
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Keyboard, Pressable, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

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
  /** "sheet" (default): the whole panel drags. "handle": only the grabber drags. */
  dragZone?: "sheet" | "handle";
  /** Show the little grabber bar (always shown when dragZone is "handle"). */
  showHandle?: boolean;
  /** Fraction of the screen height the panel may occupy (default 0.9). */
  maxHeightRatio?: number;
  /** Fixed panel height as a fraction of the screen (comments: 0.82). Content then fills it. */
  heightRatio?: number;
  /** Corner radius of the top edge. */
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

const MAX_WIDTH = 576; // max-w-xl
const DISMISS_VELOCITY = 800; // px/s flick
const DISMISS_RATIO = 0.3; // drag past 30% of the panel height
const SLIDE_MS = 240;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export function Sheet({
  onClose,
  children,
  dragZone = "sheet",
  showHandle = false,
  maxHeightRatio = 0.9,
  heightRatio,
  radius = "2xl",
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

  // 0 = fully open, panelH = fully off-screen. Start off-screen and slide in.
  const panelH = useSharedValue(windowH);
  const translateY = useSharedValue(windowH);
  const closing = useSharedValue(false);

  const finish = useCallback(() => onClose(), [onClose]);

  const close = useCallback(() => {
    if (closing.value) return;
    closing.value = true;
    translateY.value = withTiming(panelH.value, { duration: SLIDE_MS, easing: EASE }, (done) => {
      if (done) scheduleOnRN(finish);
    });
  }, [closing, finish, panelH, translateY]);

  useBackDismiss(onBackStep ?? close);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
          if (closing.value) return;
          // Dragging down follows the finger 1:1; dragging up resists.
          translateY.value = e.translationY > 0 ? e.translationY : e.translationY / 6;
        })
        .onEnd((e) => {
          if (closing.value) return;
          const shouldDismiss = e.velocityY > DISMISS_VELOCITY || translateY.value > panelH.value * DISMISS_RATIO;
          if (shouldDismiss) {
            closing.value = true;
            translateY.value = withTiming(panelH.value, { duration: SLIDE_MS, easing: EASE }, (done) => {
              if (done) scheduleOnRN(finish);
            });
          } else {
            translateY.value = withTiming(0, { duration: 220, easing: EASE });
          }
        }),
    [closing, finish, panelH, translateY]
  );

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  // The keyboard overlaps the bottom of the window (edge-to-edge): pad the host by its height so the
  // panel docks on top of it, and cap the panel to what's left so its header can't be pushed off-screen.
  const hostStyle = useAnimatedStyle(() => ({ paddingBottom: avoidKeyboard ? keyboard.height.value : 0 }));
  const sizeStyle = useAnimatedStyle(() => {
    const room = windowH - (avoidKeyboard ? keyboard.height.value : 0) - insets.top - 12;
    return heightRatio ? { height: Math.min(windowH * heightRatio, room) } : { maxHeight: Math.min(windowH * maxHeightRatio, room) };
  });
  // The keyboard already clears the bottom edge, so the safe-area padding is dropped while it is up.
  const safeBottomStyle = useAnimatedStyle(() => ({ paddingBottom: avoidKeyboard && keyboard.height.value > 0 ? 0 : insets.bottom }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, Math.max(panelH.value, 1)], [1, 0], "clamp"),
  }));

  const grabber = (
    <View className="items-center pb-1 pt-2.5" accessibilityElementsHidden importantForAccessibility="no">
      <View className="h-1 w-9 rounded-full bg-ink-muted-a30" />
    </View>
  );
  const handleVisible = showHandle || dragZone === "handle";

  const panel = (
    <Animated.View
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        const first = panelH.value === windowH && translateY.value === windowH;
        panelH.value = h;
        if (first) translateY.value = withTiming(0, { duration: SLIDE_MS, easing: EASE });
      }}
      style={[
        { width: "100%", maxWidth: MAX_WIDTH },
        sizeStyle,
        panelStyle,
      ]}
      className={`border-t border-border bg-surface ${radius === "3xl" ? "rounded-t-3xl" : "rounded-t-2xl"}`}
    >
      {handleVisible && dragZone === "handle" ? <GestureDetector gesture={pan}>{grabber}</GestureDetector> : null}
      {handleVisible && dragZone === "sheet" ? grabber : null}
      <Animated.View style={[{ flex: heightRatio ? 1 : undefined, flexShrink: 1 }, safeBottomStyle]}>{children}</Animated.View>
    </Animated.View>
  );

  const ctx = useMemo(() => ({ close }), [close]);

  return (
    <Portal zIndex={zIndex}>
      <SheetContext.Provider value={ctx}>
        <Animated.View
          className="flex-1 items-center justify-end"
          style={hostStyle}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
        >
          <Animated.View className="absolute inset-0" style={scrimStyle}>
            <GlassScrim tone={scrim} />
            <Pressable className="flex-1" onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
          </Animated.View>

          {dragZone === "sheet" ? <GestureDetector gesture={pan}>{panel}</GestureDetector> : panel}
        </Animated.View>
      </SheetContext.Provider>
    </Portal>
  );
}

