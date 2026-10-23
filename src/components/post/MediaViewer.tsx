// src/components/post/MediaViewer.tsx
// Full-screen media viewer: swipe between items, pinch / double-tap to zoom
// images, drag down to dismiss (the backdrop fades and the media shrinks as you
// drag, or flick). Android Back and the X button close it. Paging is a native paging ScrollView; the zoom
// and dismiss gestures are Gesture Handler + Reanimated so they run on the UI
// thread.
import { useVideoPlayer } from "expo-video";
import { SafeVideoView } from "../ui/SafeVideoView";
import { X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { Portal } from "@/components/ui/Portal";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useSwipeDownDismiss } from "@/hooks/useSwipeDownDismiss";
import { isVideoUrl } from "@/hooks/useUploadPostMedia";
import { fadeInAndPlay, fadeOutAndPause } from "@/lib/mediaFade";

const MIN_SCALE = 1;
const ZOOM_SCALE = 2.5;
const MAX_SCALE = 4;
const SNAP_TO_MIN = 1.05;

interface MediaViewerProps {
  mediaUrls: string[];
  startIndex: number;
  onClose: () => void;
}

function clamp(v: number, lo: number, hi: number) {
  "worklet";
  return Math.min(hi, Math.max(lo, v));
}

interface ZoomableImageProps {
  url: string;
  width: number;
  height: number;
  /** True while this slide is the visible one — zoom resets when it isn't. */
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
}

function ZoomableImage({ url, width, height, active, onZoomChange }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  const reportZoom = useCallback(
    (z: boolean) => {
      setZoomed(z);
      onZoomChange(z);
    },
    [onZoomChange]
  );

  // Landing on a different slide always starts it un-zoomed.
  useEffect(() => {
    if (!active) {
      scale.value = 1;
      savedScale.value = 1;
      tx.value = 0;
      ty.value = 0;
      setZoomed(false);
    }
  }, [active, scale, savedScale, tx, ty]);

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        scale.value = clamp(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
      })
      .onEnd(() => {
        if (scale.value < SNAP_TO_MIN) {
          scale.value = withTiming(1, { duration: 200 });
          tx.value = withTiming(0, { duration: 200 });
          ty.value = withTiming(0, { duration: 200 });
          savedScale.value = 1;
          savedTx.value = 0;
          savedTy.value = 0;
          scheduleOnRN(reportZoom, false);
        } else {
          savedScale.value = scale.value;
          scheduleOnRN(reportZoom, true);
        }
      });

    // Moves the image once zoomed; bounded so an edge can't be dragged past the screen edge.
    const zoomPan = Gesture.Pan()
      .enabled(zoomed)
      .minPointers(1)
      .maxPointers(1)
      .onUpdate((e) => {
        const maxX = (width * (scale.value - 1)) / 2;
        const maxY = (height * (scale.value - 1)) / 2;
        tx.value = clamp(savedTx.value + e.translationX, -maxX, maxX);
        ty.value = clamp(savedTy.value + e.translationY, -maxY, maxY);
      })
      .onEnd(() => {
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDistance(40)
      .onEnd(() => {
        if (scale.value > 1) {
          scale.value = withTiming(1, { duration: 200 });
          tx.value = withTiming(0, { duration: 200 });
          ty.value = withTiming(0, { duration: 200 });
          savedScale.value = 1;
          savedTx.value = 0;
          savedTy.value = 0;
          scheduleOnRN(reportZoom, false);
        } else {
          scale.value = withTiming(ZOOM_SCALE, { duration: 200 });
          savedScale.value = ZOOM_SCALE;
          scheduleOnRN(reportZoom, true);
        }
      });

    return Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, zoomPan));
  }, [zoomed, width, height, scale, savedScale, tx, ty, savedTx, savedTy, reportZoom]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height, alignItems: "center", justifyContent: "center" }, style]}>
        <Image source={{ uri: url }} contentFit="contain" style={{ width, height }} />
      </Animated.View>
    </GestureDetector>
  );
}

function ViewerVideo({ url, width, height, active }: { url: string; width: number; height: number; active: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  useEffect(() => {
    if (active) fadeInAndPlay(player);
    else fadeOutAndPause(player);
  }, [active, player]);
  return <SafeVideoView player={player} contentFit="contain" nativeControls style={{ width, height }} />;
}

export function MediaViewer({ mediaUrls, startIndex, onClose }: MediaViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  useBackDismiss(onClose);
  // Drag down to close; off while an image is zoomed (a drag pans it then).
  const { gesture: dismissGesture, contentStyle, backdropStyle } = useSwipeDownDismiss(onClose, !zoomed);

  // Open on the tapped slide without an animated scroll from the first one.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: startIndex * width, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  return (
    <Portal zIndex={80}>
      <Animated.View style={[{ flex: 1 }, backdropStyle]}>
        <GestureDetector gesture={dismissGesture}>
          <Animated.View style={[{ flex: 1 }, contentStyle]}>
            <ScrollView showsVerticalScrollIndicator={false}
              ref={scrollRef}
              horizontal
              pagingEnabled
              scrollEnabled={!zoomed}
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumEnd}
              decelerationRate="fast"
              style={{ flex: 1 }}
            >
              {mediaUrls.map((url, i) =>
                isVideoUrl(url) ? (
                  <ViewerVideo key={`${url}-${i}`} url={url} width={width} height={height} active={i === index} />
                ) : (
                  <ZoomableImage key={`${url}-${i}`} url={url} width={width} height={height} active={i === index} onZoomChange={setZoomed} />
                )
              )}
            </ScrollView>
          </Animated.View>
        </GestureDetector>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          className="absolute left-3 h-10 w-10 items-center justify-center rounded-full bg-black-a55"
          style={{ top: insets.top + 8 }}
        >
          <Icon as={X} size={20} color="#FFFFFF" />
        </Pressable>

        {mediaUrls.length > 1 ? (
          <View pointerEvents="none" className="absolute inset-x-0 items-center" style={{ top: insets.top + 18 }}>
            <Text className="text-sm text-white-a80">
              {index + 1} / {mediaUrls.length}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </Portal>
  );
}
