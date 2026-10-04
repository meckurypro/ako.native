// src/components/ui/SwipeToSwitch.tsx
// Horizontal swipe changes tabs for screens whose content is ONE vertical list
// (the profile: header + sticky tab bar + the active tab's items), where a
// side-by-side carousel isn't possible. A fast or long-enough horizontal swipe
// moves one tab left/right; vertical drags scroll the list as normal.
// Provides the same gesture context as SwipeableTabs, so a post's image
// carousel inside the list still wins horizontal drags over this.
import type { ReactNode } from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

import { TabsGestureContext } from "./SwipeableTabs";

const COMMIT_DISTANCE = 70;
const COMMIT_VELOCITY = 600; // px/s

export function SwipeToSwitch({
  index,
  count,
  onIndexChange,
  children,
  enabled = true,
}: {
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
  children: ReactNode;
  enabled?: boolean;
}) {
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-16, 16])
        .failOffsetY([-12, 12])
        .onEnd((e) => {
          const dx = e.translationX;
          const v = e.velocityX;
          if ((dx <= -COMMIT_DISTANCE || v <= -COMMIT_VELOCITY) && index < count - 1) scheduleOnRN(onIndexChange, index + 1);
          else if ((dx >= COMMIT_DISTANCE || v >= COMMIT_VELOCITY) && index > 0) scheduleOnRN(onIndexChange, index - 1);
        }),
    [enabled, index, count, onIndexChange]
  );

  return (
    <TabsGestureContext.Provider value={pan}>
      <GestureDetector gesture={pan}>
        <View style={{ flex: 1 }}>{children}</View>
      </GestureDetector>
    </TabsGestureContext.Provider>
  );
}
