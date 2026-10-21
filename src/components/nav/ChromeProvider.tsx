// src/components/nav/ChromeProvider.tsx
// Shared "chrome" state for the persistent bottom nav: whether it is hidden
// (auto-hides while scrolling down, returns on scroll up — the web's
// useAutoHideOnScroll) and how tall it is (so lists can pad their content).
//
// Screens attach `useChromeScroll()` to their scroll view / list:
//   const onScroll = useChromeScroll();
//   <FlashList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} ref={onScroll.listRef} onScroll={onScroll} scrollEventThrottle={16} … />
// `hidden` is a shared value, so toggling it never re-renders React.
// Passing `ref={onScroll.listRef}` also lets the app-wide scroll-to-top arrow
// (ScrollToTopButton) scroll that list; screens that already own a ref can pass
// it instead: useChromeScroll(myRef).
import { useFocusEffect } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
  useState,
  type ReactNode,
} from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, View } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

interface ChromeContextValue {
  /** 0 = nav visible, 1 = nav hidden. */
  hidden: SharedValue<number>;
  /** Measured nav height including safe-area padding (0 until laid out). */
  navHeight: number;
  setNavHeight: (h: number) => void;
  /** Android needs the content the bar blurs wrapped in a BlurTargetView; this is its ref. */
  blurTarget: RefObject<View | null>;
  /** Measured height of the auto-hiding top bar of the focused screen (0 when none). */
  topBarHeight: number;
  setTopBarHeight: (h: number) => void;
  /** True once the visible list is scrolled past SCROLL_TOP_THRESHOLD (drives the scroll-to-top arrow). */
  showScrollTop: boolean;
  /** Scrolls the list the arrow currently refers to (null when nothing is scrolled far enough). */
  scrollToTopRef: MutableRefObject<(() => void) | null>;
  /** Lists (one per useChromeScroll call) on the focused screen; internal bookkeeping for the arrow. */
  scrollRegistry: MutableRefObject<Set<ScrollInstance>>;
  /** Which SwipeableTabs pane is on screen (null = screen has no tab panes). */
  setActivePane: (pane: number | null) => void;
  /** Recomputes showScrollTop + scrollToTopRef from the registry and the active pane. */
  publishScrollTop: () => void;
  /** Whether a list in `pane` is the one on screen (lists outside any tab pane always are). */
  isPaneActive: (pane: number | null) => boolean;
}

/**
 * One scrollable list. A screen can mount several at once (the Feed keeps For You / Top / Following alive side by
 * side), so the arrow must follow the one that is actually on screen — never "whichever registered last".
 */
export interface ScrollInstance {
  /** Index of the SwipeableTabs pane this list lives in, or null when it isn't inside one. */
  pane: number | null;
  /** Last known scroll offset. */
  y: number;
  /** Scrolls this list to the top. */
  action: () => void;
}

const ChromeContext = createContext<ChromeContextValue | null>(null);

/** Index of the SwipeableTabs pane the caller renders in (null outside tabs). Provided by SwipeableTabs. */
export const PaneIndexContext = createContext<number | null>(null);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const hidden = useSharedValue(0);
  const [navHeight, setNavHeight] = useState(0);
  const [topBarHeight, setTopBarHeight] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollToTopRef = useRef<(() => void) | null>(null);
  const scrollRegistry = useRef<Set<ScrollInstance>>(new Set());
  const activePane = useRef<number | null>(null);
  const blurTarget = useRef<View | null>(null);

  const publishScrollTop = useCallback(() => {
    // Only lists on screen count: ones outside any tab pane, or in the pane currently shown.
    let best: ScrollInstance | null = null;
    for (const inst of scrollRegistry.current) {
      if (inst.pane !== null && inst.pane !== activePane.current) continue;
      if (!best || inst.y > best.y) best = inst;
    }
    const show = !!best && best.y > SCROLL_TOP_THRESHOLD;
    scrollToTopRef.current = show && best ? best.action : null;
    setShowScrollTop(show);
  }, []);

  const setActivePane = useCallback(
    (pane: number | null) => {
      // Moving to another tab always brings the bars back. The "hidden" flag is shared by every pane, but only the list
      // being scrolled ever updates it: scroll down in one tab, swipe to a short or empty one, and nothing there can
      // scroll up — so without this the bars stayed gone until you swiped back. (Standard tab behaviour: a new
      // section starts with its navigation showing.)
      if (pane !== null && pane !== activePane.current) hidden.value = 0;
      activePane.current = pane;
      publishScrollTop();
    },
    [hidden, publishScrollTop]
  );

  const isPaneActive = useCallback((pane: number | null) => pane === null || activePane.current === null || pane === activePane.current, []);

  const value = useMemo(
    () => ({
      hidden, navHeight, setNavHeight, blurTarget, topBarHeight, setTopBarHeight,
      showScrollTop, scrollToTopRef, scrollRegistry, setActivePane, publishScrollTop, isPaneActive,
    }),
    [hidden, navHeight, blurTarget, topBarHeight, showScrollTop, setActivePane, publishScrollTop, isPaneActive]
  );
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

/** Like useChrome but returns null outside a ChromeProvider (for shared UI that may render anywhere). */
export function useOptionalChrome(): ChromeContextValue | null {
  return useContext(ChromeContext);
}

export function useChrome(): ChromeContextValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error("useChrome must be used within <ChromeProvider>");
  return ctx;
}

/**
 * Keeps the bars showing while `when` is true — for a list that has nothing to scroll (loading, empty, error, offline
 * notice) or that is being pulled to refresh. Scrolling is the only thing that un-hides the bars, so a list that can't
 * scroll must never be left sitting under bars that were hidden by another one. Only acts for the list that is on
 * screen: a neighbouring tab going empty in the background must not pop the bars in while you scroll elsewhere.
 */
export function useRevealChromeWhen(when: boolean) {
  const chrome = useOptionalChrome();
  const pane = useContext(PaneIndexContext);
  const hidden = chrome?.hidden;
  const isPaneActive = chrome?.isPaneActive;
  useEffect(() => {
    if (!when || !hidden || !isPaneActive?.(pane)) return;
    hidden.value = 0;
  }, [when, pane, hidden, isPaneActive]);
}

const SHOW_NEAR_TOP_PX = 8;

/** How far down (px) a screen must be scrolled before the scroll-to-top arrow appears. */
export const SCROLL_TOP_THRESHOLD = 480;

// FlashList / FlatList expose scrollToOffset; ScrollView exposes scrollTo.
type ScrollTarget = {
  scrollToOffset?: (p: { offset: number; animated?: boolean }) => void;
  scrollTo?: (p: { x?: number; y?: number; animated?: boolean }) => void;
};

function scrollToTop(target: ScrollTarget | null | undefined) {
  if (!target) return;
  if (typeof target.scrollToOffset === "function") target.scrollToOffset({ offset: 0, animated: true });
  else if (typeof target.scrollTo === "function") target.scrollTo({ y: 0, animated: true });
}

export type ChromeScrollHandler = ((e: NativeSyntheticEvent<NativeScrollEvent>) => void) & {
  /** Attach to the screen's list/ScrollView (`ref={onScroll.listRef}`) so the scroll-to-top arrow can scroll it. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listRef: MutableRefObject<any>;
};

/**
 * Scroll handler that hides the bottom nav on scroll-down and shows it on scroll-up, and
 * drives the app-wide scroll-to-top arrow. Pass your own list ref as `listRef` if the
 * screen already has one; otherwise use the `.listRef` the returned handler carries.
 */
export function useChromeScroll(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  externalRef?: MutableRefObject<any> | RefObject<any>,
  threshold = 6
): ChromeScrollHandler {
  const { hidden, scrollRegistry, publishScrollTop } = useChrome();
  const pane = useContext(PaneIndexContext);
  const lastY = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownRef = useRef<any>(null);
  const listRef = (externalRef ?? ownRef) as MutableRefObject<unknown>;

  // This list's entry in the arrow's registry. Created once; `pane` is refreshed every render.
  const instance = useRef<ScrollInstance>({
    pane,
    y: 0,
    action: () => scrollToTop(listRef.current as ScrollTarget | null),
  });
  instance.current.pane = pane;

  // While its screen is focused the list is a candidate for the arrow; a newly focused screen starts with the
  // nav showing. The offset is kept across blur/focus (a screen popped back to keeps its scroll position).
  useFocusEffect(
    useCallback(() => {
      hidden.value = 0;
      lastY.current = 0;
      const inst = instance.current;
      scrollRegistry.current.add(inst);
      publishScrollTop();
      return () => {
        scrollRegistry.current.delete(inst);
        publishScrollTop();
      };
    }, [hidden, scrollRegistry, publishScrollTop])
  );

  const handler = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = Math.max(e.nativeEvent.contentOffset.y, 0);
      const delta = y - lastY.current;
      if (y <= SHOW_NEAR_TOP_PX) hidden.value = 0;
      else if (delta > threshold) hidden.value = 1;
      else if (delta < -threshold) hidden.value = 0;
      lastY.current = y;

      instance.current.y = y;
      publishScrollTop(); // setState bails out when nothing changed, so this is cheap per scroll event
    },
    [hidden, threshold, publishScrollTop]
  );

  return useMemo(() => Object.assign(handler, { listRef: listRef as ChromeScrollHandler["listRef"] }), [handler, listRef]);
}
