// src/components/messages/ImageViewer.tsx
// Full-screen photo viewer: swipe between the photos of an album, pinch or double-tap to
// zoom, tap to hide/show the bars, share from the top bar. Opens on the tapped photo.
import { Image } from "expo-image";
import { ArrowLeft, ImageOff, Share2 } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { Portal } from "@/components/ui/Portal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useMediaUrl } from "@/hooks/useMediaUrl";
import type { MediaItem } from "@/lib/chatMedia";
import { openChatFile } from "@/lib/downloadChatFile";

interface ImageViewerProps {
  items: MediaItem[];
  initialIndex: number;
  /** Who sent it and when — shown in the top bar, like WhatsApp. */
  title: string;
  subtitle: string;
  caption?: string;
  onClose: () => void;
}

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;

function ZoomPage({ item, width, height, onToggleChrome, onZoomChange }: { item: MediaItem; width: number; height: number; onToggleChrome: () => void; onZoomChange: (zoomed: boolean) => void }) {
  const { url, failed } = useMediaUrl(item);
  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const setZoom = useCallback(
    (z: boolean) => {
      setZoomed(z);
      onZoomChange(z);
    },
    [onZoomChange]
  );

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_ZOOM, Math.max(1, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
        scheduleOnRN(setZoom, false);
      } else {
        scheduleOnRN(setZoom, true);
      }
    });

  // Panning only exists while zoomed in, so at 1× the horizontal swipe belongs to the pager.
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => {
      const limitX = (width * (scale.value - 1)) / 2;
      const limitY = (height * (scale.value - 1)) / 2;
      tx.value = Math.max(-limitX, Math.min(limitX, savedTx.value + e.translationX));
      ty.value = Math.max(-limitY, Math.min(limitY, savedTy.value + e.translationY));
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
        scheduleOnRN(setZoom, false);
      } else {
        scale.value = withTiming(DOUBLE_TAP_ZOOM);
        savedScale.value = DOUBLE_TAP_ZOOM;
        scheduleOnRN(setZoom, true);
      }
    });
  const singleTap = Gesture.Tap().numberOfTaps(1).onEnd(() => scheduleOnRN(onToggleChrome));

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height }} className="items-center justify-center overflow-hidden">
        {failed ? (
          <View className="items-center gap-2">
            <Icon as={ImageOff} size={32} color="rgba(255,255,255,0.6)" />
            <Text className="text-sm text-white/60">Photo unavailable</Text>
          </View>
        ) : url ? (
          <Animated.View style={[{ width, height }, style]}>
            <Image source={{ uri: url }} contentFit="contain" style={{ width, height }} transition={150} cachePolicy="disk" />
          </Animated.View>
        ) : (
          <ActivityIndicator color="#FFFFFF" />
        )}
      </View>
    </GestureDetector>
  );
}

export function ImageViewer({ items, initialIndex, title, subtitle, caption, onClose }: ImageViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [index, setIndex] = useState(initialIndex);
  const [chrome, setChrome] = useState(true);
  const [anyZoomed, setAnyZoomed] = useState(false);
  const listRef = useRef<FlatList<MediaItem>>(null);
  useBackDismiss(onClose, true);

  const toggleChrome = useCallback(() => setChrome((c) => !c), []);
  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
      setAnyZoomed(false);
    },
    [width]
  );

  async function share() {
    try {
      await openChatFile(items[index]);
    } catch {
      toast("Couldn't open that photo.", { variant: "error" });
    }
  }

  return (
    <Portal zIndex={70}>
      <View className="flex-1 bg-black">
        <FlatList
          ref={listRef}
          data={items}
          horizontal
          pagingEnabled
          scrollEnabled={!anyZoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(it, i) => `${it.path ?? it.url}-${i}`}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={({ item }) => <ZoomPage item={item} width={width} height={height} onToggleChrome={toggleChrome} onZoomChange={setAnyZoomed} />}
        />

        {chrome ? (
          <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(120)} pointerEvents="box-none" className="absolute inset-0">
            <View className="absolute inset-x-0 top-0 flex-row items-center bg-black/55 px-1 pb-2" style={{ paddingTop: insets.top + 4 }}>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} className="p-3">
                <Icon as={ArrowLeft} size={22} color="#FFFFFF" />
              </Pressable>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-base font-semibold text-white">
                  {title}
                </Text>
                <Text numberOfLines={1} className="text-xs text-white/70">
                  {items.length > 1 ? `${index + 1} of ${items.length} · ${subtitle}` : subtitle}
                </Text>
              </View>
              <Pressable onPress={() => void share()} accessibilityRole="button" accessibilityLabel="Share photo" hitSlop={8} className="p-3">
                <Icon as={Share2} size={21} color="#FFFFFF" />
              </Pressable>
            </View>
            {caption ? (
              <View className="absolute inset-x-0 bottom-0 bg-black/55 px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
                <Text className="text-sm text-white">{caption}</Text>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </Portal>
  );
}
