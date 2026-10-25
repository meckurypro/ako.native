// src/components/customPage/HeroSlides.tsx
// Crossfading hero slideshow. One image = no timer. With "reduce motion" on, the first image stays still and the dots
// step through the rest.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { Image } from "@/components/ui/styled";
import { publicFileUrl, type CustomPageImage } from "../../lib/customPage";

function Slide({ uri, active, label, fade }: { uri: string; active: boolean; label: string; fade: boolean }) {
  const opacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, { duration: fade ? 900 : 0 });
  }, [active, fade, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={label} />
    </Animated.View>
  );
}

export function HeroSlides({
  images,
  aspectRatio,
  overlay,
  intervalMs = 5500,
  style,
  index: indexProp,
  onIndexChange,
  dots = true,
}: {
  images: CustomPageImage[];
  aspectRatio: number;
  /** Content laid over the slides (the Showcase template puts the title here). */
  overlay?: ReactNode;
  intervalMs?: number;
  style?: ViewStyle;
  /** Controlled mode: the parent owns which slide shows (templates with Previous / Next controls). */
  index?: number;
  onIndexChange?: (index: number) => void;
  /** Show the dot row. Templates that draw their own controls turn it off. */
  dots?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [inner, setInner] = useState(0);
  const index = indexProp ?? inner;
  const count = images.length;
  const latest = useRef({ index, onIndexChange });
  latest.current = { index, onIndexChange };
  const setIndex = (n: number) => {
    setInner(n);
    latest.current.onIndexChange?.(n);
  };

  useEffect(() => {
    if (count < 2 || reduceMotion) return;
    const t = setInterval(() => setIndex((latest.current.index + 1) % count), intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, intervalMs, reduceMotion]);

  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, index]);

  if (count === 0) return null;

  return (
    <View style={[{ width: "100%", aspectRatio, overflow: "hidden" }, style]}>
      {images.map((img, i) => {
        const uri = publicFileUrl(img.path);
        return uri ? <Slide key={img.path} uri={uri} active={i === index} label={img.caption ?? ""} fade={!reduceMotion} /> : null;
      })}
      {overlay}
      {count > 1 && dots ? (
        <View style={{ position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6, zIndex: 10 }}>
          {images.map((img, i) => (
            <Pressable
              key={img.path}
              onPress={() => setIndex(i)}
              accessibilityRole="button"
              accessibilityLabel={`Show image ${i + 1}`}
              hitSlop={8}
              style={{ height: 6, width: i === index ? 22 : 8, borderRadius: 3, backgroundColor: i === index ? "#fff" : "rgba(255,255,255,0.55)" }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
