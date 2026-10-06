// src/components/messages/VoiceRecordingBar.tsx
// Shown over the composer while recording. Unlocked: pulsing dot, timer,
// "slide to cancel" that follows your finger, and a lock hint that rises as you
// drag up. Locked: discard · live waveform + timer · pause/resume · stop.
import { ChevronsLeft, Lock, Mic, Pause, Square, Trash2 } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { VoiceWaveform } from "@/components/ui/VoiceWaveform";
import { formatVoiceDuration } from "@/lib/voiceNotes";

interface VoiceRecordingBarProps {
  locked: boolean;
  paused: boolean;
  elapsedMs: number;
  drag: { x: number; y: number };
  cancelThresholdPx: number;
  lockThresholdPx: number;
  liveLevels: number[];
  onCancel: () => void;
  onTogglePause: () => void;
  onStop: () => void;
}

function PulseDot() {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style} className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />;
}

export function VoiceRecordingBar({
  locked,
  paused,
  elapsedMs,
  drag,
  cancelThresholdPx,
  lockThresholdPx,
  liveLevels,
  onCancel,
  onTogglePause,
  onStop,
}: VoiceRecordingBarProps) {
  if (locked) {
    return (
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Discard recording"
          className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10"
        >
          <Icon as={Trash2} size={18} className="text-danger" />
        </Pressable>
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <VoiceWaveform levels={liveLevels} filledColor="bg-accent" mutedColor="bg-ink-muted/25" heightClass="h-5" />
          <Text className="shrink-0 text-[13px] text-ink-muted">{formatVoiceDuration(elapsedMs / 1000)}</Text>
        </View>
        <Pressable
          onPress={onTogglePause}
          accessibilityRole="button"
          accessibilityLabel={paused ? "Resume recording" : "Pause recording"}
          className="shrink-0 flex-row items-center gap-1.5 rounded-full bg-surface px-3 py-2"
        >
          <Icon as={paused ? Mic : Pause} size={16} className="text-ink" />
          <Text className="text-sm text-ink">{paused ? "Resume" : "Pause"}</Text>
        </Pressable>
        <Pressable onPress={onStop} accessibilityRole="button" accessibilityLabel="Stop recording" className="shrink-0 rounded-full bg-ink p-2.5">
          <Icon as={Square} size={16} fill="#F7F4EF" className="text-canvas" />
        </Pressable>
      </View>
    );
  }

  const cancelProgress = Math.min(1, Math.abs(drag.x) / cancelThresholdPx);
  const lockProgress = Math.min(1, drag.y / lockThresholdPx);

  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      {/* Lock hint rises with the upward drag and tints once it will engage. */}
      <View
        pointerEvents="none"
        className="absolute rounded-full border border-border bg-surface p-2"
        style={{ right: 24, bottom: 44 + lockProgress * 8, opacity: 0.4 + lockProgress * 0.6, transform: [{ scale: 1 + lockProgress * 0.15 }] }}
      >
        <Icon as={Lock} size={16} className={lockProgress >= 1 ? "text-accent" : "text-ink-muted"} />
      </View>

      <PulseDot />
      <Text className="shrink-0 text-sm text-ink">{formatVoiceDuration(elapsedMs / 1000)}</Text>

      <View className="min-w-0 flex-1 items-end">
        <View className="flex-row items-center gap-1" style={{ transform: [{ translateX: drag.x }], opacity: 1 - cancelProgress * 0.8 }}>
          <Icon as={ChevronsLeft} size={16} className="text-ink-muted" />
          <Text className="text-sm text-ink-muted">Slide to cancel</Text>
        </View>
      </View>

      <View className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent">
        <Icon as={Mic} size={18} className="text-white" />
      </View>
    </View>
  );
}
