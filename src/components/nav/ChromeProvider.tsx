// src/components/nav/ChromeProvider.tsx
// Shared "chrome" state for the persistent bottom nav: whether it is hidden
// (auto-hides while scrolling down, returns on scroll up — the web's
// useAutoHideOnScroll) and how tall it is (so lists can pad their content).
//
// Screens attach `useChromeScroll()` to their scroll view / list:
//   const onScroll = useChromeScroll();
//   <FlashList ref={onScroll.listRef} onScroll={onScroll} scrollEventThrottle={16} … />
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
  /** True once the focused screen is scrolled past SCROLL_TOP_THRESHOLD (drives the scroll-to-top arrow). */
  showScrollTop: boolean;
  setShowScrollTop: (v: boolean) => void;
  /** Scroll action registered by the focused screen's list (null when it registered none). */
  scrollToTopRef: MutableRefObject<(() => void) | null>;
}

const ChromeContext = createContext<ChromeContextValue | null>(null);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const hidden = useSharedValue(0);
  const [navHeight, setNavHeight] = useState(0);
  const [topBarHeight, setTopBarHeight] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollToTopRef = useRef<(() => void) | null>(null);
  const blurTarget = useRef<View | null>(null);
  const value = useMemo(
    () => ({ hidden, navHeight, setNavHeight, blurTarget, topBarHeight, setTopBarHeight, showScrollTop, setShowScrollTop, scrollToTopRef }),
    [hidden, navHeight, blurTarget, topBarHeight, showScrollTop]
  );
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): ChromeContextValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error("useChrome must be used within <ChromeProvider>");
  return ctx;
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
  const { hidden, setShowScrollTop, scrollToTopRef } = useChrome();
  const lastY = useRef(0);
  const shownRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownRef = useRef<any>(null);
  const listRef = (externalRef ?? ownRef) as MutableRefObject<unknown>;

  // A newly focused screen always starts with the nav showing and the arrow hidden;
  // while focused it owns the scroll-to-top action.
  useFocusEffect(
    useCallback(() => {
      hidden.value = 0;
      lastY.current = 0;
      shownRef.current = false;
      setShowScrollTop(false);
      const action = () => scrollToTop(listRef.current as ScrollTarget | null);
      scrollToTopRef.current = action;
      return () => {
        if (scrollToTopRef.current === action) scrollToTopRef.current = null;
        shownRef.current = false;
        setShowScrollTop(false);
      };
    }, [hidden, setShowScrollTop, scrollToTopRef, listRef])
  );

  // Safety net if the screen unmounts without a blur.
  useEffect(() => () => setShowScrollTop(false), [setShowScrollTop]);

  const handler = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = Math.max(e.nativeEvent.contentOffset.y, 0);
      const delta = y - lastY.current;
      if (y <= SHOW_NEAR_TOP_PX) hidden.value = 0;
      else if (delta > threshold) hidden.value = 1;
      else if (delta < -threshold) hidden.value = 0;
      lastY.current = y;

      const show = y > SCROLL_TOP_THRESHOLD;
      if (show !== shownRef.current) {
        shownRef.current = show;
        setShowScrollTop(show);
      }
    },
    [hidden, threshold, setShowScrollTop]
  );

  return useMemo(() => Object.assign(handler, { listRef: listRef as ChromeScrollHandler["listRef"] }), [handler, listRef]);
}
