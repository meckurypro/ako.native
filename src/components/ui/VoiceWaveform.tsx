// src/components/ui/VoiceWaveform.tsx
// Voice-note bars. Bars up to `progress` use `filledColor`, the rest `mutedColor` (both Tailwind bg-* classes).
// When `onSeek` is given the bars are a scrubber, like WhatsApp: tap to jump, or press and DRAG to scrub.
// While dragging, `onScrub(ratio)` reports the live position (and `onScrub(null)` when the finger lifts) so
// the caller can show the scrub time; `onSeek(ratio)` fires once, on release/tap, so the player isn't
// flooded with seeks mid-drag.
import { useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

interface VoiceWaveformProps {
  /** 0..1 amplitude values, rendered left-to-right. */
  levels: number[];
  /** 0..1 — bars up to this point render in `filledColor`. */
  progress?: number;
  filledColor: string;
  mutedColor: string;
  onSeek?: (ratio: number) => void;
  onScrub?: (ratio: number | null) => void;
  /** Height class (web default h-7). */
  heightClass?: string;
  /** WhatsApp's round scrub handle riding the bars at the current position (a bg-* class). */
  thumbColor?: string;
}

const THUMB = 14;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function VoiceWaveform({
  levels,
  progress = 0,
  filledColor,
  mutedColor,
  onSeek,
  onScrub,
  heightClass = "h-7",
  thumbColor,
}: VoiceWaveformProps) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const shown = dragRatio ?? progress;

  const ratioAt = (x: number) => (widthRef.current > 0 ? clamp01(x / widthRef.current) : 0);
  const scrub = (x: number) => {
    const r = ratioAt(x);
    setDragRatio(r);
    onScrub?.(r);
  };
  const finish = (x: number | null) => {
    setDragRatio(null);
    onScrub?.(null);
    if (x !== null) onSeek?.(ratioAt(x));
  };

  // Pan wins over the chat's swipe-to-reply (it activates after 6px, the swipe after 12px) and gives up to
  // vertical list scrolling. Tap handles a plain press.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onStart((e) => scrub(e.x))
    .onUpdate((e) => scrub(e.x))
    .onEnd((e) => finish(e.x))
    .onFinalize((_e, success) => {
      if (!success) finish(null);
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(10)
    .onEnd((e, success) => {
      if (success) onSeek?.(ratioAt(e.x));
    });
  const gesture = Gesture.Exclusive(pan, tap);

  const bars = (
    <View
      className={`flex-row items-center gap-[2.5px] ${onSeek ? "w-full" : "min-w-0 flex-1"} ${heightClass}`}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
        setWidth(e.nativeEvent.layout.width);
      }}
    >
      {levels.map((level, i) => {
        const isFilled = i / levels.length <= shown;
        return (
          <View
            key={i}
            className={`flex-1 rounded-full ${isFilled ? filledColor : mutedColor}`}
            style={{ height: `${Math.max(10, level * 100)}%` }}
          />
        );
      })}
      {thumbColor && width > 0 ? (
        <View
          pointerEvents="none"
          className={`absolute rounded-full ${thumbColor}`}
          style={{
            width: THUMB,
            height: THUMB,
            left: Math.max(0, Math.min(width - THUMB, shown * width - THUMB / 2)),
            top: "50%",
            marginTop: -THUMB / 2,
            transform: [{ scale: dragRatio !== null ? 1.25 : 1 }],
          }}
        />
      ) : null}
    </View>
  );

  if (!onSeek) return bars;

  return (
    <GestureDetector gesture={gesture}>
      {/* Taller than the bars so a thumb can actually hit it. */}
      <View accessible accessibilityRole="adjustable" accessibilityLabel="Seek voice note" className="min-w-0 flex-1 justify-center py-2">
        {bars}
      </View>
    </GestureDetector>
  );
}
