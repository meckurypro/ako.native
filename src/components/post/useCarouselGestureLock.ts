// src/components/post/useCarouselGestureLock.ts
// A horizontal carousel inside a swipeable tab pane must win horizontal drags,
// or paging through images would drag the whole feed to another tab (the web's
// `data-swipeable-ignore`). Wrap the carousel's gesture-handler ScrollView in
// <GestureDetector gesture={lock}>; it makes the tabs' pan wait for it.
import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";

import { useTabsGesture } from "@/components/ui/SwipeableTabs";

export function useCarouselGestureLock() {
  const tabsGesture = useTabsGesture();
  return useMemo(() => {
    const native = Gesture.Native();
    if (tabsGesture) native.blocksExternalGesture(tabsGesture);
    return native;
  }, [tabsGesture]);
}
