// src/components/project/book/ChapterScrollMark.tsx
// A faint vertical mark on the left edge that shows where you are in the chapter. It appears only while
// the reader is scrolling and fades a moment after the finger is lifted (and any glide has stopped).
// The track has a fixed length; the mark is shorter in a long chapter and longer in a short one, so its
// size tells you what kind of chapter you're in before you've read it.
import { useCallback, useEffect, useRef } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

export const MARK_TRACK_H = 168;
const MARK_MIN_H = 14;
const HIDE_AFTER_MS = 500;

export function useChapterScrollMark() {
  const opacity = useSharedValue(0);
  const thumbTop = useSharedValue(0);
  const thumbH = useSharedValue(MARK_TRACK_H);
  const down = useRef(false);
  const user = useRef(false); // true from the moment a finger starts a scroll until the mark has hidden again
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const scheduleHide = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      user.current = false;
      opacity.value = withTiming(0, { duration: 260 });
    }, HIDE_AFTER_MS);
  }, [opacity]);

  useEffect(() => clearTimer, []);

  /** Feed every scroll event. Moves the mark; shows it only for scrolls the reader's finger started. */
  const onMetrics = useCallback(
    (offsetY: number, contentH: number, viewH: number) => {
      const range = contentH - viewH;
      if (range <= 0 || contentH <= 0) {
        opacity.value = 0; // the whole chapter fits on screen: nothing to track
        return;
      }
      const f = Math.min(1, Math.max(0, offsetY / range));
      const h = Math.min(MARK_TRACK_H, Math.max(MARK_MIN_H, (MARK_TRACK_H * viewH) / contentH));
      thumbH.value = h;
      thumbTop.value = f * (MARK_TRACK_H - h);
      if (!user.current) return;
      opacity.value = withTiming(1, { duration: 120 });
      if (!down.current) scheduleHide();
    },
    [opacity, scheduleHide, thumbH, thumbTop]
  );

  const onBeginDrag = useCallback(() => {
    down.current = true;
    user.current = true;
    clearTimer();
    opacity.value = withTiming(1, { duration: 120 });
  }, [opacity]);

  const onEndDrag = useCallback(() => {
    down.current = false;
    scheduleHide();
  }, [scheduleHide]);

  /** A new chapter starts with the mark hidden. */
  const reset = useCallback(() => {
    clearTimer();
    down.current = false;
    user.current = false;
    opacity.value = 0;
    thumbTop.value = 0;
  }, [opacity, thumbTop]);

  return { opacity, thumbTop, thumbH, onMetrics, onBeginDrag, onEndDrag, reset };
}

export function ChapterScrollMark({ mark, color, top }: { mark: ReturnType<typeof useChapterScrollMark>; color: string; top: number }) {
  const wrap = useAnimatedStyle(() => ({ opacity: mark.opacity.value }));
  const thumb = useAnimatedStyle(() => ({ height: mark.thumbH.value, transform: [{ translateY: mark.thumbTop.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 5, top, width: 3, height: MARK_TRACK_H }, wrap]}>
      {/* Track: barely there. */}
      <Animated.View style={{ position: "absolute", left: 1, top: 0, bottom: 0, width: 1, borderRadius: 1, backgroundColor: color, opacity: 0.16 }} />
      {/* Mark: where you are. */}
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: 3, borderRadius: 2, backgroundColor: color, opacity: 0.5 }, thumb]} />
    </Animated.View>
  );
}
