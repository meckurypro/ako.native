// src/components/project/ThumbnailCropSheet.tsx
//
// The crop screen every project thumbnail goes through when the picture isn't already the required shape (port of the
// web ThumbnailCropModal). The frame is locked to the shape the project's type needs (lib/thumbnailSpec.ts): drag to
// reposition, pinch (or the − / + buttons) to zoom, and what's inside the frame is exactly what is saved and shown
// everywhere. Calls onConfirm with the cropped LocalFile; nothing is uploaded here.
import { Minus, Plus, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Portal } from "@/components/ui/Portal";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { cropRectToSpec } from "@/lib/cropImage";
import { getImageSize, type LocalFile } from "@/lib/localFile";
import type { ThumbSpec } from "@/lib/thumbnailSpec";

const MAX_ZOOM = 4;

interface Props {
  file: LocalFile;
  spec: ThumbSpec;
  /** Heading, e.g. "Crop video thumbnail". */
  title?: string;
  /** Short reason shown under the frame. */
  note?: string;
  onCancel: () => void;
  onConfirm: (cropped: LocalFile) => void | Promise<void>;
}

export function ThumbnailCropSheet({ file, spec, title = "Crop thumbnail", note, onCancel, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  useBackDismiss(() => {
    if (!busy) onCancel();
  });

  const [nat, setNat] = useState<{ w: number; h: number } | null>(file.width && file.height ? { w: file.width, h: file.height } : null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (nat) return;
    getImageSize(file)
      .then((s) => setNat({ w: s.width, h: s.height }))
      .catch(() => setError("That image couldn't be read. Try a different one."));
  }, [file, nat]);

  // The largest frame of the required shape that fits the screen (leaving room for the title and buttons).
  const { fw, fh } = useMemo(() => {
    const maxW = winW - 32;
    const maxH = Math.max(160, winH - insets.top - insets.bottom - 280);
    let w = maxW;
    let h = w / spec.ratio;
    if (h > maxH) {
      h = maxH;
      w = h * spec.ratio;
    }
    return { fw: Math.round(w), fh: Math.round(h) };
  }, [winW, winH, insets.top, insets.bottom, spec.ratio]);

  // "Cover" scale at zoom 1: the picture just fills the frame.
  const base = nat ? Math.max(fw / nat.w, fh / nat.h) : 1;
  const imgW = nat ? nat.w * base : fw;
  const imgH = nat ? nat.h * base : fh;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        const next = Math.min(MAX_ZOOM, Math.max(1, savedScale.value * e.scale));
        scale.value = next;
        const mx = Math.max(0, (imgW * next - fw) / 2);
        const my = Math.max(0, (imgH * next - fh) / 2);
        tx.value = Math.min(mx, Math.max(-mx, tx.value));
        ty.value = Math.min(my, Math.max(-my, ty.value));
      })
      .onEnd(() => {
        savedScale.value = scale.value;
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });
    const pan = Gesture.Pan()
      .onUpdate((e) => {
        const mx = Math.max(0, (imgW * scale.value - fw) / 2);
        const my = Math.max(0, (imgH * scale.value - fh) / 2);
        tx.value = Math.min(mx, Math.max(-mx, savedTx.value + e.translationX));
        ty.value = Math.min(my, Math.max(-my, savedTy.value + e.translationY));
      })
      .onEnd(() => {
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });
    return Gesture.Simultaneous(pan, pinch);
  }, [imgW, imgH, fw, fh, scale, savedScale, tx, ty, savedTx, savedTy]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  function nudgeZoom(delta: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, scale.value + delta));
    const mx = Math.max(0, (imgW * next - fw) / 2);
    const my = Math.max(0, (imgH * next - fh) / 2);
    const nx = Math.min(mx, Math.max(-mx, tx.value));
    const ny = Math.min(my, Math.max(-my, ty.value));
    scale.value = withTiming(next, { duration: 120 });
    savedScale.value = next;
    tx.value = withTiming(nx, { duration: 120 });
    ty.value = withTiming(ny, { duration: 120 });
    savedTx.value = nx;
    savedTy.value = ny;
  }

  async function handleConfirm() {
    if (!nat || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The frame, expressed in the picture's own pixels.
      const s = base * scale.value;
      const w = Math.min(nat.w, fw / s);
      const h = Math.min(nat.h, fh / s);
      const x = nat.w / 2 + (-fw / 2 - tx.value) / s;
      const y = nat.h / 2 + (-fh / 2 - ty.value) / s;
      const cropped = await cropRectToSpec(
        file,
        { originX: Math.max(0, Math.min(nat.w - w, x)), originY: Math.max(0, Math.min(nat.h - h, y)), width: w, height: h },
        spec
      );
      await onConfirm(cropped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't crop that image.");
      setBusy(false);
    }
  }

  return (
    <Portal zIndex={90}>
      <View style={{ flex: 1, backgroundColor: "#000000", paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ height: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
          <Pressable
            onPress={busy ? undefined : onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-black-a55"
          >
            <Icon as={X} size={20} color="#FFFFFF" />
          </Pressable>
          <Text className="flex-1 text-center font-display font-semibold text-base text-white">{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <GestureDetector gesture={gesture}>
            <View style={{ width: fw, height: fh, overflow: "hidden", borderRadius: 16, backgroundColor: "#111111" }}>
              {nat ? (
                <Animated.View
                  style={[{ position: "absolute", left: (fw - imgW) / 2, top: (fh - imgH) / 2, width: imgW, height: imgH }, imageStyle]}
                >
                  <Image source={{ uri: file.uri }} style={{ width: imgW, height: imgH }} resizeMode="cover" />
                </Animated.View>
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              )}
              {/* Thin frame so the edge of the saved thumbnail is obvious. */}
              <View
                pointerEvents="none"
                style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 16, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)" }}
              />
            </View>
          </GestureDetector>

          <Text className="mt-3 px-8 text-center text-xs text-white/70">
            {spec.label}. {note ?? "Drag to reposition, pinch to zoom."}
          </Text>
          {error ? <Text className="mt-2 px-8 text-center text-sm text-danger">{error}</Text> : null}
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 12 }}>
            <Pressable
              onPress={() => nudgeZoom(-0.5)}
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              className="h-11 w-11 items-center justify-center rounded-full bg-black-a55"
            >
              <Icon as={Minus} size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={() => nudgeZoom(0.5)}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              className="h-11 w-11 items-center justify-center rounded-full bg-black-a55"
            >
              <Icon as={Plus} size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          <Pressable
            onPress={handleConfirm}
            disabled={busy || !nat}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !nat, busy }}
            className={`items-center justify-center rounded-xl bg-cta py-3 ${busy || !nat ? "opacity-50" : "active:opacity-85"}`}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-base font-semibold text-white">Use thumbnail</Text>}
          </Pressable>
        </View>
      </View>
    </Portal>
  );
}
