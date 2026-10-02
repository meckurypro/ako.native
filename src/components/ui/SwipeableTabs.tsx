// src/components/ui/SwipeableTabs.tsx
// Drag-tracking tab carousel — the content follows your finger during the
// swipe and settles on release, like WhatsApp's top tabs. Shared by Feed,
// ProfilePage, LikedHub and SavedHub.
//
// ── Native architecture change (important) ───────────────────────────────
// On web every pane has natural height and the *page* scrolls, so the
// carousel animates its own height to match the active pane. A virtualized
// native list can't live inside a natural-height container, so here the
// carousel is given a fixed area (flex-1) and EACH PANE SCROLLS ITSELF
// (a FlashList / ScrollView per pane). Bonuses: every tab keeps its own scroll
// position for free (the web needed scrollPositionsRef for that), and there's
// no height tracking or "bounce" to fight.
//
// Gesture rules carried over from web:
//   • axis lock after ~6px: a vertical start fails this gesture so the pane's
//     list scrolls; a horizontal start owns it
//   • commit at 33% of a pane's width, or on a fast flick (0.5 px/ms)
//   • rubber-band (÷2.5) when dragging past the first/last pane
//   • panes mount lazily: the active tab and its immediate neighbours only
//   • children that own horizontal drags themselves (ReactionTray's action
//     strip) opt out with useBlockTabSwipe()
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const COMMIT_RATIO = 0.33;
const COMMIT_VELOCITY = 0.5; // px/ms
const EDGE_RESISTANCE = 2.5;
const AXIS_LOCK_PX = 6;
const SETTLE_MS = 300;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

const TabsGestureContext = createContext<GestureType | null>(null);

/**
 * Mark a child gesture as owning horizontal drags (the web's
 * `data-swipeable-ignore`). Chain the result onto the child's own gesture:
 *   const tabs = useTabsGesture();
 *   const pan = Gesture.Pan()…; if (tabs) pan.blocksExternalGesture(tabs);
 */
export function useTabsGesture(): GestureType | null {
  return useContext(TabsGestureContext);
}

interface SwipeableTabsProps {
  /** Active tab (owned by the parent, e.g. via useTabState). */
  index: number;
  /** Called once a swipe commits to a new tab. */
  onIndexChange: (index: number) => void;
  /**
   * Continuous position while dragging (1.4 = 40% of the way from tab 1 to 2)
   * plus whether a drag is in progress. For indicator bars that should track
   * the finger; prefer `progress` (a shared value) to avoid JS-thread hops.
   */
  onProgress?: (progress: number, dragging: boolean) => void;
  /** Shared value kept in sync with the continuous position, for UI-thread indicators. */
  progress?: SharedValue<number>;
  /** One pane per tab, in tab order. Give each pane its own scrolling list. */
  children: ReactNode[];
  className?: string;
}

export function SwipeableTabs({ index, onIndexChange, onProgress, progress, children, className }: SwipeableTabsProps) {
  const count = children.length;

  // Lazy mount: the active pane and its immediate neighbours.
  const [visited, setVisited] = useState<Set<number>>(() => neighbours(index, count, new Set()));
  useEffect(() => {
    setVisited((prev) => {
      const next = neighbours(index, count, prev);
      return next.size === prev.size ? prev : next;
    });
  }, [index, count]);

  const [paneWidth, setPaneWidth] = useState(0);
  const width = useSharedValue(0);
  const indexSV = useSharedValue(index);
  const offset = useSharedValue(0); // resting translateX
  const drag = useSharedValue(0); // live finger offset
  const dragging = useSharedValue(false);

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w === width.value) return;
    width.value = w;
    offset.value = -indexSV.value * w; // re-anchor on rotation/resize, no animation
    setPaneWidth(w);
  }

  // Tab-button jumps (or a parent-driven index change) animate to the new pane.
  useEffect(() => {
    indexSV.value = index;
    if (paneWidth > 0 && !dragging.value) {
      offset.value = withTiming(-index * paneWidth, { duration: SETTLE_MS, easing: EASE });
    }
  }, [index, paneWidth, indexSV, offset, dragging]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-AXIS_LOCK_PX, AXIS_LOCK_PX])
        .failOffsetY([-AXIS_LOCK_PX * 2, AXIS_LOCK_PX * 2])
        .onStart(() => {
          dragging.value = true;
        })
        .onUpdate((e) => {
          let dx = e.translationX;
          const i = indexSV.value;
          if ((i === 0 && dx > 0) || (i === count - 1 && dx < 0)) dx /= EDGE_RESISTANCE;
          drag.value = dx;
        })
        .onEnd((e) => {
          const w = width.value || 1;
          const i = indexSV.value;
          const velocity = e.velocityX / 1000; // px/ms, negative = leftward

          let target = i;
          if (drag.value <= -w * COMMIT_RATIO || velocity <= -COMMIT_VELOCITY) target = Math.min(count - 1, i + 1);
          else if (drag.value >= w * COMMIT_RATIO || velocity >= COMMIT_VELOCITY) target = Math.max(0, i - 1);

          // Fold the live drag into the resting offset so release is continuous.
          offset.value = offset.value + drag.value;
          drag.value = 0;
          offset.value = withTiming(-target * w, { duration: SETTLE_MS, easing: EASE });
          if (target !== i) scheduleOnRN(onIndexChange, target);
        })
        .onFinalize(() => {
          dragging.value = false;
        }),
    [count, drag, dragging, indexSV, offset, onIndexChange, width]
  );

  // Continuous position across the whole strip, for indicator bars.
  useAnimatedReaction(
    () => -(offset.value + drag.value) / (width.value || 1),
    (current, previous) => {
      if (progress) progress.value = current;
      if (onProgress && current !== previous && dragging.value) scheduleOnRN(onProgress, current, true);
    }
  );
  useAnimatedReaction(
    () => dragging.value,
    (isDragging, wasDragging) => {
      if (onProgress && wasDragging && !isDragging) {
        scheduleOnRN(onProgress, indexSV.value, false);
      }
    }
  );

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value + drag.value }],
  }));

  return (
    <TabsGestureContext.Provider value={pan}>
      <GestureDetector gesture={pan}>
        <View className={`flex-1 overflow-hidden ${className ?? ""}`} onLayout={onLayout}>
          <Animated.View style={[{ flex: 1, flexDirection: "row", width: Math.max(1, count * paneWidth) }, trackStyle]}>
            {children.map((child, i) => (
              <View key={i} style={{ width: paneWidth || undefined, flex: paneWidth ? undefined : 1 }}>
                {visited.has(i) ? child : null}
              </View>
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
    </TabsGestureContext.Provider>
  );
}

function neighbours(index: number, count: number, from: Set<number>): Set<number> {
  const next = new Set(from);
  next.add(index);
  if (index > 0) next.add(index - 1);
  if (index < count - 1) next.add(index + 1);
  return next;
}
