// src/components/project/book/ChapterScrollMark.tsx
// The reader's scroll indicator, drawn to match the browser's own scrollbar on the web reader: a rounded
// thumb on the right edge, as long as the share of the chapter that is on screen (so a long chapter gets
// a short thumb and a short one a long thumb), sitting at the top of the track at the start of the chapter
// and moving down as you read. It shows only while the reader is scrolling and fades about half a second
// after the finger lifts (and any glide has stopped).
import { useCallback, useEffect, useRef } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

export const MARK_WIDTH = 5;
const MARK_MIN_H = 32;
const HIDE_AFTER_MS = 500;

export function useChapterScrollMark() {
  const opacity = useSharedValue(0);
  const thumbTop = useSharedValue(0);
  const thumbH = useSharedValue(MARK_MIN_H);
  const track = useRef(400); // length of the track the thumb travels along, set by the reader
  const down = useRef(false);
  const user = useRef(false); // true from the moment a finger starts a scroll until the thumb has hidden again
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

  const setTrack = useCallback((h: number) => {
    track.current = Math.max(MARK_MIN_H, h);
  }, []);

  /** Feed every scroll event. Moves the thumb; shows it only for scrolls the reader's finger started. */
  const onMetrics = useCallback(
    (offsetY: number, contentH: number, viewH: number) => {
      const range = contentH - viewH;
      if (range <= 0 || contentH <= 0) {
        opacity.value = 0; // the whole chapter fits on screen: nothing to track
        return;
      }
      const t = track.current;
      const f = Math.min(1, Math.max(0, offsetY / range));
      const h = Math.min(t, Math.max(MARK_MIN_H, (t * viewH) / contentH));
      thumbH.value = h;
      thumbTop.value = f * (t - h);
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

  /** A new chapter starts with the thumb hidden. */
  const reset = useCallback(() => {
    clearTimer();
    down.current = false;
    user.current = false;
    opacity.value = 0;
    thumbTop.value = 0;
  }, [opacity, thumbTop]);

  return { opacity, thumbTop, thumbH, setTrack, onMetrics, onBeginDrag, onEndDrag, reset };
}

export function ChapterScrollMark({
  mark,
  color,
  top,
  height,
}: {
  mark: ReturnType<typeof useChapterScrollMark>;
  color: string;
  /** Top of the track, and its length. */
  top: number;
  height: number;
}) {
  const wrap = useAnimatedStyle(() => ({ opacity: mark.opacity.value }));
  const thumb = useAnimatedStyle(() => ({ height: mark.thumbH.value, transform: [{ translateY: mark.thumbTop.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", right: 2, top, width: MARK_WIDTH, height }, wrap]}>
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: MARK_WIDTH, borderRadius: MARK_WIDTH / 2, backgroundColor: color, opacity: 0.55 }, thumb]} />
    </Animated.View>
  );
}
