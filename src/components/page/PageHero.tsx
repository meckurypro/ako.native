// src/components/page/PageHero.tsx
// The hero slideshow at the top of a Page's landing view: one 16:9 frame of images, each with an optional
// title and caption. Visitors swipe through it or tap a segment; it also advances on its own, in the
// direction and at the pace the page's admin chose. It pauses whenever it shouldn't be moving — a finger
// on it, the app in the background, the screen not focused, "reduce motion" on, or the visitor pressing
// pause. (Mirrors the web component of the same name.)
import { Pause, Play } from "lucide-react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, FlatList, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { HeroDirection, PageHeroSlide } from "@/types/database";

interface PageHeroProps {
  slides: PageHeroSlide[];
  autoplay: boolean;
  intervalSeconds: number;
  direction: HeroDirection;
  pageName: string;
  /** Lets the screen switch off its own swipe-between-tabs while a finger is on the slideshow. */
  onTouchLock?: (locked: boolean) => void;
}

const ASPECT = 16 / 9;

// Stacked translucent bands stand in for a gradient scrim (no gradient dependency in the app).
function BottomScrim() {
  return (
    <View pointerEvents="none" className="absolute inset-x-0 bottom-0" style={{ height: "62%" }}>
      {[0.08, 0.16, 0.28, 0.42, 0.58].map((a, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: `rgba(0,0,0,${a})` }} />
      ))}
    </View>
  );
}

function Segment({ active, running, canAutoplay, seconds, onPress, label }: { active: boolean; running: boolean; canAutoplay: boolean; seconds: number; onPress: () => void; label: string }) {
  const fill = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(fill);
    if (!active) {
      fill.value = 0;
      return;
    }
    if (!canAutoplay) {
      fill.value = 1;
      return;
    }
    fill.value = 0;
    if (running) fill.value = withTiming(1, { duration: seconds * 1000, easing: Easing.linear });
  }, [active, running, canAutoplay, seconds, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} hitSlop={{ top: 10, bottom: 10 }}>
      <View className="h-1 overflow-hidden rounded-full" style={{ width: active ? 36 : 16, backgroundColor: "rgba(255,255,255,0.4)" }}>
        {active ? <Animated.View className="h-full rounded-full bg-white" style={fillStyle} /> : null}
      </View>
    </Pressable>
  );
}

export function PageHero({ slides, autoplay, intervalSeconds, direction, pageName, onTouchLock }: PageHeroProps) {
  const count = slides.length;
  const listRef = useRef<FlatList<PageHeroSlide>>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [focused, setFocused] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const fade = useSharedValue(1);
  const touchResume = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const canAutoplay = autoplay && count > 1 && !reducedMotion;
  const running = canAutoplay && !userPaused && !touching && appActive && focused && width > 0;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  useEffect(() => () => clearTimeout(touchResume.current), []);

  // A slide removed while someone is looking at the last one.
  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(count - 1, 0));
  }, [count, index]);

  const goTo = useCallback(
    (target: number, wrap = false) => {
      if (count === 0 || width === 0) return;
      const next = ((target % count) + count) % count;
      if (wrap && !reducedMotion) {
        // Rewinding smoothly would whip past every slide; dip out, jump, and fade back in.
        fade.value = withTiming(0, { duration: 160 });
        setTimeout(() => {
          listRef.current?.scrollToOffset({ offset: next * width, animated: false });
          setIndex(next);
          fade.value = withTiming(1, { duration: 200 });
        }, 170);
        return;
      }
      setIndex(next);
      listRef.current?.scrollToOffset({ offset: next * width, animated: !reducedMotion });
    },
    [count, width, reducedMotion, fade]
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      const target = index + delta;
      goTo(target, target < 0 || target > count - 1);
    },
    [count, goTo, index]
  );

  // Autoplay: one timer per slide. Anything that changes `index` (including the visitor swiping)
  // restarts it, so a manual swipe always gets a full interval.
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => step(direction === "backward" ? -1 : 1), intervalSeconds * 1000);
    return () => clearTimeout(t);
  }, [running, index, direction, intervalSeconds, step]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width === 0) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(Math.min(Math.max(i, 0), count - 1));
  }

  function releaseTouchSoon() {
    clearTimeout(touchResume.current);
    touchResume.current = setTimeout(() => setTouching(false), 1200);
  }

  if (count === 0) return null;

  return (
    <View
      accessibilityLabel={`${pageName} highlights`}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onTouchStart={() => onTouchLock?.(true)}
      onTouchEnd={() => onTouchLock?.(false)}
      onTouchCancel={() => onTouchLock?.(false)}
      className="overflow-hidden rounded-3xl bg-surface"
      style={{ aspectRatio: ASPECT }}
    >
      {width > 0 ? (
        <Animated.View style={[{ flex: 1 }, fadeStyle]}>
          <FlatList
            ref={listRef}
            data={slides}
            keyExtractor={(s) => s.id}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onScrollBeginDrag={() => {
              clearTimeout(touchResume.current);
              setTouching(true);
            }}
            onScrollEndDrag={releaseTouchSoon}
            onMomentumScrollEnd={onMomentumEnd}
            renderItem={({ item, index: i }) => (
              <View accessible accessibilityLabel={`${i + 1} of ${count}${item.title ? `: ${item.title}` : ""}`} style={{ width, aspectRatio: ASPECT }}>
                <Image source={{ uri: item.image_url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
                {item.title || item.caption ? (
                  <>
                    <BottomScrim />
                    <View className="absolute inset-x-0 bottom-0 px-5 pb-9 pt-10">
                      {item.title ? (
                        <Text numberOfLines={2} className="font-display text-xl font-semibold leading-snug text-white">
                          {item.title}
                        </Text>
                      ) : null}
                      {item.caption ? (
                        <Text numberOfLines={2} className="mt-1 text-sm leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {item.caption}
                        </Text>
                      ) : null}
                    </View>
                  </>
                ) : null}
              </View>
            )}
          />
        </Animated.View>
      ) : null}

      {count > 1 ? (
        <>
          <View pointerEvents="box-none" className="absolute inset-x-0 bottom-3 flex-row items-center justify-center gap-1.5 px-5">
            {slides.map((s, i) => (
              <Segment key={s.id} active={i === index} running={running} canAutoplay={canAutoplay} seconds={intervalSeconds} onPress={() => goTo(i)} label={`Go to slide ${i + 1}`} />
            ))}
          </View>
          {canAutoplay ? (
            <Pressable
              onPress={() => setUserPaused((p) => !p)}
              accessibilityRole="button"
              accessibilityLabel={userPaused ? "Play slideshow" : "Pause slideshow"}
              hitSlop={8}
              className="absolute right-3 top-3 h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
            >
              <Icon as={userPaused ? Play : Pause} size={14} className="text-white" />
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
