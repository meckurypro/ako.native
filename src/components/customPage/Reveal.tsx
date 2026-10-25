// src/components/customPage/Reveal.tsx
// Scroll-reveal for Custom Page sections. A section waits until the visitor scrolls it into view, then fades / slides /
// zooms in. Respects the system "reduce motion" setting (content simply appears) and only animates opacity and
// transform. If a section can't be measured it is shown at once — a section must never stay invisible.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import type { AnimationId } from "../../lib/customPage";

/** Tells sections how far down the page the visitor has seen, in the scroll content's own coordinates. */
export interface RevealBus {
  bottom: number;
  listeners: Set<(bottom: number) => void>;
  contentRef: RefObject<View | null> | null;
  see: (bottom: number) => void;
}

export function useRevealBus(): RevealBus {
  return useMemo<RevealBus>(() => {
    const bus: RevealBus = {
      bottom: 0,
      listeners: new Set(),
      contentRef: null,
      see(next) {
        if (next <= bus.bottom) return;
        bus.bottom = next;
        bus.listeners.forEach((l) => l(next));
      },
    };
    return bus;
  }, []);
}

export const RevealContext = createContext<RevealBus | null>(null);

const SLIDE = 28;
const DURATION = 700;
const STAGGER_MS = 90;
const SEEN_MARGIN = 40;

export function Reveal({
  animation,
  index = 0,
  style,
  children,
}: {
  animation: AnimationId;
  /** Position among siblings — only the "stagger" preset uses it, as a delay. */
  index?: number;
  style?: ViewStyle;
  children: ReactNode;
}) {
  const bus = useContext(RevealContext);
  const reduceMotion = useReducedMotion();
  const skip = animation === "none" || reduceMotion || !bus;
  const [shown, setShown] = useState(skip);
  const ref = useRef<View>(null);
  const top = useRef<number | null>(null);
  const progress = useSharedValue(skip ? 1 : 0);

  useEffect(() => {
    if (skip) setShown(true);
  }, [skip]);

  // Show once the visitor's view reaches this section; subscribe so later scrolling re-checks.
  useEffect(() => {
    if (!bus || shown) return;
    const check = (bottom: number) => {
      if (top.current !== null && top.current < bottom - SEEN_MARGIN) setShown(true);
    };
    bus.listeners.add(check);
    return () => {
      bus.listeners.delete(check);
    };
  }, [bus, shown]);

  // Safety net: a section that can't be positioned is shown rather than left invisible.
  useEffect(() => {
    if (shown) return;
    const t = setTimeout(() => {
      if (top.current === null) setShown(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [shown]);

  useEffect(() => {
    if (!shown || skip) {
      if (skip) progress.value = 1;
      return;
    }
    const delay = animation === "stagger" ? index * STAGGER_MS : 0;
    progress.value = withDelay(delay, withTiming(1, { duration: DURATION }));
  }, [shown, skip, animation, index, progress]);

  const animated = useAnimatedStyle(() => {
    const p = progress.value;
    if (animation === "zoom") return { opacity: p, transform: [{ scale: 0.95 + 0.05 * p }] };
    if (animation === "slide-up" || animation === "stagger") return { opacity: p, transform: [{ translateY: (1 - p) * SLIDE }] };
    return { opacity: p };
  });

  function measure() {
    const content = bus?.contentRef?.current;
    if (!bus || !content || !ref.current) return;
    ref.current.measureLayout(
      content,
      (_x, y) => {
        top.current = y;
        if (y < bus.bottom - SEEN_MARGIN) setShown(true);
      },
      () => setShown(true)
    );
  }

  if (skip) return <View style={style}>{children}</View>;

  return (
    <Animated.View ref={ref} collapsable={false} onLayout={measure} style={[style, animated]}>
      {children}
    </Animated.View>
  );
}
