// src/components/nav/ChromeProvider.tsx
// Shared "chrome" state for the persistent bottom nav: whether it is hidden
// (auto-hides while scrolling down, returns on scroll up — the web's
// useAutoHideOnScroll) and how tall it is (so lists can pad their content).
//
// Screens attach `useChromeScroll()` to their scroll view / list:
//   const onScroll = useChromeScroll();
//   <FlashList onScroll={onScroll} scrollEventThrottle={16} … />
// `hidden` is a shared value, so toggling it never re-renders React.
import { useFocusEffect } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

interface ChromeContextValue {
  /** 0 = nav visible, 1 = nav hidden. */
  hidden: SharedValue<number>;
  /** Measured nav height including safe-area padding (0 until laid out). */
  navHeight: number;
  setNavHeight: (h: number) => void;
}

const ChromeContext = createContext<ChromeContextValue | null>(null);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const hidden = useSharedValue(0);
  const [navHeight, setNavHeight] = useState(0);
  const value = useMemo(() => ({ hidden, navHeight, setNavHeight }), [hidden, navHeight]);
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useChrome(): ChromeContextValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error("useChrome must be used within <ChromeProvider>");
  return ctx;
}

const SHOW_NEAR_TOP_PX = 8;

/** Scroll handler that hides the bottom nav on scroll-down and shows it on scroll-up. */
export function useChromeScroll(threshold = 6) {
  const { hidden } = useChrome();
  const lastY = useRef(0);

  // A newly focused screen always starts with the nav showing.
  useFocusEffect(
    useCallback(() => {
      hidden.value = 0;
      lastY.current = 0;
    }, [hidden])
  );

  return useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = Math.max(e.nativeEvent.contentOffset.y, 0);
      const delta = y - lastY.current;
      if (y <= SHOW_NEAR_TOP_PX) hidden.value = 0;
      else if (delta > threshold) hidden.value = 1;
      else if (delta < -threshold) hidden.value = 0;
      lastY.current = y;
    },
    [hidden, threshold]
  );
}
