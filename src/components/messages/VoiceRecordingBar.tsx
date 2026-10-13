// src/components/messages/VoiceRecordingBar.tsx
// Shown over the composer while recording, WhatsApp-style.
//   Holding: one pill with pulsing dot + timer · "‹ Slide to cancel" (breathes, follows your finger) ·
//            a big mic that follows your finger · a tall lock capsule standing above it fills as you slide up.
//   Locked:  a panel — row 1: timer + live waveform; row 2: trash · big "Pause" pill · send.
//            (Without `onSend` — the Rooms composer — it keeps the original pause/stop layout.)
import { ChevronLeft, ChevronUp, Lock, Mic, Pause, Play, Send, Square, Trash2 } from "lucide-react-native";
import { memo, useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { VoiceWaveform } from "@/components/ui/VoiceWaveform";
import { useRecorderLive, type RecorderLiveStore } from "@/lib/recorderLiveStore";
import { formatVoiceDuration } from "@/lib/voiceNotes";

interface VoiceRecordingBarProps {
  locked: boolean;
  paused: boolean;
  /** Timer, drag offset and live waveform — read here (not in the screen) so only this bar re-renders per tick. */
  live: RecorderLiveStore;
  cancelThresholdPx: number;
  lockThresholdPx: number;
  onCancel: () => void;
  onTogglePause: () => void;
  onStop: () => void;
  /** When given, the locked bar shows a send button (record → send in one tap, like WhatsApp). */
  onSend?: () => void;
  /** When given and paused, shows a play button that opens the draft preview. */
  onPreview?: () => void;
}

function PulseDot({ still }: { still?: boolean }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (still) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(withSequence(withTiming(0.3, { duration: 650 }), withTiming(1, { duration: 650 })), -1);
  }, [opacity, still]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style} className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />;
}

/** The "slide to cancel" hint breathes so it reads as a prompt, not a label. */
function Breathing({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.45, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function VoiceRecordingBarImpl({
  locked,
  paused,
  live,
  cancelThresholdPx,
  lockThresholdPx,
  onCancel,
  onTogglePause,
  onStop,
  onSend,
  onPreview,
}: VoiceRecordingBarProps) {
  const { elapsedMs, drag, levels: liveLevels } = useRecorderLive(live);
  if (locked && onSend) {
    return (
      <View className="rounded-t-3xl border-t border-border bg-surface px-4 pb-4 pt-5">
        <View className="flex-row items-center gap-3">
          <Text className="shrink-0 text-base text-ink">{formatVoiceDuration(elapsedMs / 1000)}</Text>
          {paused && onPreview ? (
            <Pressable onPress={onPreview} accessibilityRole="button" accessibilityLabel="Play back recording" hitSlop={6} className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-muted-a15">
              <Icon as={Play} size={14} fill="#8A8A8A" className="text-ink-muted" />
            </Pressable>
          ) : null}
          <VoiceWaveform levels={liveLevels} filledColor="bg-ink-muted" mutedColor="bg-ink-muted-a40" heightClass="h-8" />
        </View>
        <View className="mt-5 flex-row items-center gap-3">
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Delete recording" className="h-14 w-14 shrink-0 items-center justify-center rounded-full bg-danger-a15">
            <Icon as={Trash2} size={24} className="text-danger" />
          </Pressable>
          <Pressable
            onPress={onTogglePause}
            accessibilityRole="button"
            accessibilityLabel={paused ? "Resume recording" : "Pause recording"}
            className="h-14 min-w-0 flex-1 flex-row items-center justify-center gap-3 rounded-full bg-ink-muted-a15 active:bg-ink-muted-a25"
          >
            <Icon as={paused ? Mic : Pause} size={22} className="text-ink" />
            <Text className="text-base font-medium text-ink">{paused ? "Resume" : "Pause"}</Text>
          </Pressable>
          <Pressable onPress={onSend} accessibilityRole="button" accessibilityLabel="Send voice message" className="h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink active:opacity-80">
            <Icon as={Send} size={24} className="text-canvas" />
          </Pressable>
        </View>
      </View>
    );
  }

  if (locked) {
    // Original layout (Rooms): discard · waveform · pause/resume · stop-to-preview.
    return (
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Discard recording" className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-a10">
          <Icon as={Trash2} size={18} className="text-danger" />
        </Pressable>
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <VoiceWaveform levels={liveLevels} filledColor="bg-accent" mutedColor="bg-ink-muted-a25" heightClass="h-5" />
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
  const willCancel = cancelProgress > 0.7;
  const dx = Math.max(-cancelThresholdPx, drag.x);
  const dy = Math.min(lockThresholdPx, Math.max(0, drag.y));

  return (
    <View className="px-3 py-3">
      {/* One pill: dot + timer on the left, "Slide to cancel" in the middle; the mic overlaps its right end. */}
      <View className="h-12 flex-row items-center gap-3 rounded-full bg-surface pl-4 pr-16">
        <PulseDot />
        <Text className="shrink-0 text-base text-ink-muted">{formatVoiceDuration(elapsedMs / 1000)}</Text>
        <View className="min-w-0 flex-1 items-center">
          <Breathing>
            <View className="flex-row items-center gap-1" style={{ transform: [{ translateX: dx }], opacity: 1 - cancelProgress * 0.85 }}>
              <Icon as={ChevronLeft} size={16} className={willCancel ? "text-danger" : "text-ink-muted"} />
              <Text className={`text-base ${willCancel ? "text-danger" : "text-ink-muted"}`}>Slide to cancel</Text>
            </View>
          </Breathing>
        </View>
      </View>

      {/* Tall lock capsule standing on the mic — it tints as the finger slides up into it. */}
      <View
        pointerEvents="none"
        className={`absolute w-12 items-center gap-3 rounded-full border pt-4 ${lockProgress >= 1 ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
        style={{ right: 12, bottom: 30, height: 112, opacity: 0.7 + lockProgress * 0.3, transform: [{ translateY: -lockProgress * 12 }] }}
      >
        <Icon as={Lock} size={20} className={lockProgress >= 1 ? "text-accent" : "text-ink"} />
        <Icon as={ChevronUp} size={16} className="text-ink-muted" />
      </View>

      {/* The big mic swells under the finger and follows it. */}
      <View
        pointerEvents="none"
        className={`absolute h-12 w-12 items-center justify-center rounded-full ${willCancel ? "bg-danger" : "bg-ink"}`}
        style={{
          right: 12,
          bottom: 12,
          transform: [{ translateX: dx }, { translateY: -dy }, { scale: 1.5 }],
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        <Icon as={Mic} size={22} className={willCancel ? "text-white" : "text-canvas"} />
      </View>
    </View>
  );
}

export const VoiceRecordingBar = memo(VoiceRecordingBarImpl);
