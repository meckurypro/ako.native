// src/hooks/useSwipeDownDismiss.ts
// Drag-down-to-close for full-screen viewers (post media, avatars, chat photos) — the
// Instagram / X gesture: the content follows the finger and shrinks slightly, the black
// backdrop fades as you drag, and letting go past a distance or with a quick flick slides it
// away; otherwise it springs back. Everything runs on the UI thread.
//
// Wrap the viewer's content in <GestureDetector gesture={gesture}><Animated.View style={contentStyle}>
// and paint the backdrop with backdropStyle. Vertical drags activate it; horizontal ones fail it
// so the paging list keeps its swipe. Single-pointer only, so pinch-zoom is never hijacked, and
// pass enabled={false} while an image is zoomed (a drag then pans the image instead).
import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { Easing, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 800;

export function useSwipeDownDismiss(onClose: () => void, enabled: boolean = true) {
  const { height } = useWindowDimensions();
  const dragY = useSharedValue(0);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .maxPointers(1)
        .activeOffsetY([-10, 10])
        .failOffsetX([-16, 16])
        .onUpdate((e) => {
          dragY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          if (dragY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
            dragY.value = withTiming(height, { duration: 180, easing: Easing.out(Easing.quad) }, (finished) => {
              if (finished) scheduleOnRN(onClose);
            });
          } else {
            dragY.value = withSpring(0, { damping: 20, stiffness: 220 });
          }
        }),
    [enabled, height, dragY, onClose]
  );

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }, { scale: interpolate(dragY.value, [0, height], [1, 0.7], "clamp") }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${interpolate(dragY.value, [0, height * 0.45], [1, 0], "clamp")})`,
  }));

  return { gesture, contentStyle, backdropStyle };
}
