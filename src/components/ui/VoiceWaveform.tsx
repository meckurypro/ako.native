// src/components/ui/VoiceWaveform.tsx
// Voice-note bars. Bars up to `progress` use `filledColor`, the rest
// `mutedColor` (both Tailwind bg-* classes). When `onSeek` is given, tapping
// anywhere on the bars seeks playback to that ratio — WhatsApp's tap-to-scrub.
import { useState } from "react";
import { Pressable, View } from "react-native";

interface VoiceWaveformProps {
  /** 0..1 amplitude values, rendered left-to-right. */
  levels: number[];
  /** 0..1 — bars up to this point render in `filledColor`. */
  progress?: number;
  filledColor: string;
  mutedColor: string;
  onSeek?: (ratio: number) => void;
  /** Height class (web default h-7). */
  heightClass?: string;
}

export function VoiceWaveform({
  levels,
  progress = 0,
  filledColor,
  mutedColor,
  onSeek,
  heightClass = "h-7",
}: VoiceWaveformProps) {
  const [width, setWidth] = useState(0);

  const bars = (
    <View
      className={`min-w-0 flex-1 flex-row items-center gap-[2.5px] ${heightClass}`}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {levels.map((level, i) => {
        const isFilled = i / levels.length <= progress;
        return (
          <View
            key={i}
            className={`flex-1 rounded-full ${isFilled ? filledColor : mutedColor}`}
            style={{ height: `${Math.max(10, level * 100)}%` }}
          />
        );
      })}
    </View>
  );

  if (!onSeek) return bars;

  return (
    <Pressable
      className="min-w-0 flex-1"
      accessibilityRole="adjustable"
      accessibilityLabel="Seek voice note"
      onPress={(e) => {
        if (width <= 0) return;
        onSeek(Math.min(1, Math.max(0, e.nativeEvent.locationX / width)));
      }}
    >
      {bars}
    </Pressable>
  );
}
