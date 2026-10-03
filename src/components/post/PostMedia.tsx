// src/components/post/PostMedia.tsx
// Images (and, for older posts, videos) under a post.
//   1 item   → shown at its natural aspect ratio, tap opens the viewer
//   2+ items → a paged carousel with dots + a "2/5" counter
// The carousel is a native paging ScrollView, so the swipe/settle physics are
// the platform's own rather than a hand-rolled approximation.
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useState } from "react";
import { Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector, ScrollView } from "react-native-gesture-handler";

import { Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { isVideoUrl } from "@/hooks/useUploadPostMedia";
import { MediaViewer } from "./MediaViewer";
import { useCarouselGestureLock } from "./useCarouselGestureLock";

function VideoThumb({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.muted = true;
  });
  return <VideoView player={player} contentFit="cover" nativeControls={false} style={{ width: "100%", height: "100%" }} />;
}

function Slide({ url, onLoad }: { url: string; onLoad?: (ratio: number) => void }) {
  if (isVideoUrl(url)) return <VideoThumb url={url} />;
  return (
    <Image
      source={{ uri: url }}
      contentFit="cover"
      transition={150}
      recyclingKey={url}
      style={{ width: "100%", height: "100%" }}
      onLoad={(e) => {
        if (onLoad && e.source.width && e.source.height) onLoad(e.source.width / e.source.height);
      }}
      accessibilityIgnoresInvertColors
    />
  );
}

interface SlideCarouselProps {
  mediaUrls: string[];
  onTap: (index: number) => void;
  /** Fixed frame height in px (compact embeds). Omit to derive the frame from the first image. */
  frameHeight?: number;
}

export function SlideCarousel({ mediaUrls, onTap, frameHeight }: SlideCarouselProps) {
  const lock = useCarouselGestureLock();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [frameAspect, setFrameAspect] = useState(1); // width / height, set once the first slide's size is known
  const count = mediaUrls.length;

  const handleFirstLoad = useCallback(
    (ratio: number) => {
      if (frameHeight) return;
      setFrameAspect(Math.min(1.91, Math.max(0.5, ratio)));
    },
    [frameHeight]
  );

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0) return;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  return (
    <View className={frameHeight ? "w-full" : "w-[80%]"}>
      <View
        className="w-full overflow-hidden rounded-xl border border-border bg-canvas"
        style={frameHeight ? { height: frameHeight } : { aspectRatio: frameAspect }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <GestureDetector gesture={lock}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            scrollEventThrottle={16}
            bounces
            decelerationRate="fast"
          >
            {mediaUrls.map((url, i) => (
              <Pressable key={`${url}-${i}`} onPress={() => onTap(i)} style={{ width: width || undefined, height: "100%" }}>
                <Slide url={url} onLoad={i === 0 ? handleFirstLoad : undefined} />
              </Pressable>
            ))}
          </ScrollView>
        </GestureDetector>
      </View>

      <View
        pointerEvents="none"
        className="absolute bottom-2.5 flex-row items-center gap-1.5 self-center rounded-full bg-ink/40 px-2 py-1"
      >
        {mediaUrls.map((_, i) => (
          <View key={i} className={`h-1.5 rounded-full ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />
        ))}
      </View>

      <View pointerEvents="none" className="absolute right-2 top-2 rounded-full bg-ink/50 px-2 py-0.5">
        <Text className="text-xs font-medium text-white">
          {index + 1}/{count}
        </Text>
      </View>
    </View>
  );
}

function SingleImage({ url, onPress }: { url: string; onPress: () => void }) {
  const [aspect, setAspect] = useState(1);
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" className="w-[80%] overflow-hidden rounded-xl border border-border bg-canvas">
      <View style={{ aspectRatio: aspect }}>
        <Slide url={url} onLoad={(r) => setAspect(r)} />
      </View>
    </Pressable>
  );
}

export function PostMedia({ mediaUrls }: { mediaUrls: string[] }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (mediaUrls.length === 0) return null;

  return (
    <View className="mt-3">
      {mediaUrls.length === 1 ? (
        isVideoUrl(mediaUrls[0]) ? (
          <Pressable onPress={() => setViewerIndex(0)} className="aspect-video w-[80%] overflow-hidden rounded-xl border border-border bg-canvas">
            <VideoThumb url={mediaUrls[0]} />
          </Pressable>
        ) : (
          <SingleImage url={mediaUrls[0]} onPress={() => setViewerIndex(0)} />
        )
      ) : (
        <SlideCarousel mediaUrls={mediaUrls} onTap={setViewerIndex} />
      )}

      {viewerIndex !== null ? (
        <MediaViewer mediaUrls={mediaUrls} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      ) : null}
    </View>
  );
}
