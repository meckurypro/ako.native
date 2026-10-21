// src/components/project/ProjectImageCarousel.tsx
//
// The thumbnail of a project on its OWN page, swipeable to reveal the creator's
// supporting images (thumbnail first, max 5 slides). Used only by ProjectCard when
// `isDetailView` — lists, grids and rails render the plain thumbnail.
//
// A paged horizontal FlatList: the OS owns the gesture (momentum, snapping) and the
// page's vertical scroll is untouched; we only read the offset to drive the dots.
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { Image } from "@/components/ui/styled";

export function ProjectImageCarousel({ images, fit = "cover" }: { images: string[]; fit?: "cover" | "contain" }) {
  const listRef = useRef<FlatList<string>>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [index, setIndex] = useState(0);
  const count = images.length;

  // A different set of images (e.g. after an edit) starts from the thumbnail again.
  const signature = images.join("|");
  useEffect(() => {
    setIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [signature]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!size.width) return;
      const next = Math.min(count - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / size.width)));
      setIndex((prev) => (prev === next ? prev : next));
    },
    [size.width, count]
  );

  const goTo = useCallback(
    (i: number) => {
      listRef.current?.scrollToOffset({ offset: i * size.width, animated: true });
    },
    [size.width]
  );

  return (
    <View
      style={{ width: "100%", height: "100%" }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      }}
      accessibilityRole="adjustable"
      accessibilityLabel={`Project images, ${index + 1} of ${count}`}
    >
      {size.width > 0 ? (
        <FlatList showsVerticalScrollIndicator={false}
          ref={listRef}
          data={images}
          keyExtractor={(src, i) => `${i}-${src}`}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          initialNumToRender={1}
          windowSize={3}
          getItemLayout={(_, i) => ({ length: size.width, offset: size.width * i, index: i })}
          style={{ width: size.width, height: size.height }}
          renderItem={({ item }) => (
            <View style={{ width: size.width, height: size.height }}>
              <Image source={{ uri: item }} contentFit={fit} transition={150} style={{ width: "100%", height: "100%" }} />
            </View>
          )}
        />
      ) : null}

      <View pointerEvents="box-none" style={{ position: "absolute", bottom: 12, left: 0, right: 0, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(0,0,0,0.45)" }}>
          {images.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => goTo(i)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Show image ${i + 1}`}
              style={{ height: 6, width: i === index ? 16 : 6, borderRadius: 999, backgroundColor: i === index ? "#FFFFFF" : "rgba(255,255,255,0.55)" }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
