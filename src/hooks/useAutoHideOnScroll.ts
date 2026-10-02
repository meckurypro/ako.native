// src/hooks/useAutoHideOnScroll.ts
// Native port. Hides chrome (top bar / bottom nav) while scrolling down and
// brings it back on scroll up or near the top. The web version listened to
// window scroll; here a scroll container reports its offset, so the hook
// returns an `onScroll` handler to attach to the ScrollView / FlashList
// (with scrollEventThrottle={16}) alongside the `visible` flag.
import { useCallback, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

const SHOW_NEAR_TOP_PX = 8;

export function useAutoHideOnScroll(threshold = 6) {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = Math.max(e.nativeEvent.contentOffset.y, 0);
      const delta = y - lastY.current;

      if (y <= SHOW_NEAR_TOP_PX) setVisible(true);
      else if (delta > threshold) setVisible(false);
      else if (delta < -threshold) setVisible(true);

      lastY.current = y;
    },
    [threshold]
  );

  return { visible, onScroll };
}
