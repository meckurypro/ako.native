// src/components/messages/VoiceRecordingBar.tsx
// Shown over the composer while recording, WhatsApp-style.
//   Holding: pulsing dot + timer · "‹ Slide to cancel" (shimmers, follows your finger) · the mic
//            swells and follows your finger · a lock capsule above it fills as you slide up.
//   Locked:  trash · live waveform + timer · pause/resume · send.
//            (Without `onSend` — the Rooms composer — it keeps the original pause/stop layout.)
import { ChevronLeft, ChevronUp, Lock, Mic, Pause, Play, Send, Square, Trash2 } from "lucide-react-native";
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
  onSend,
  onPreview,
}: VoiceRecordingBarProps) {
  if (locked && onSend) {
    return (
      <View className="flex-row items-center gap-2 px-3 py-3">
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Delete recording" hitSlop={6} className="h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <Icon as={Trash2} size={22} className="text-ink-muted" />
        </Pressable>
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5 rounded-3xl border border-border bg-surface px-3 py-2">
          <PulseDot still={paused} />
          <Text className="shrink-0 text-sm text-ink">{formatVoiceDuration(elapsedMs / 1000)}</Text>
          <VoiceWaveform levels={liveLevels} filledColor="bg-accent" mutedColor="bg-ink-muted/25" heightClass="h-5" />
        </View>
        {paused && onPreview ? (
          <Pressable onPress={onPreview} accessibilityRole="button" accessibilityLabel="Play back recording" hitSlop={6} className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface">
            <Icon as={Play} size={18} fill="#2B2B2B" className="text-ink" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={onTogglePause}
          accessibilityRole="button"
          accessibilityLabel={paused ? "Resume recording" : "Pause recording"}
          hitSlop={6}
          className="h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-danger"
        >
          <Icon as={paused ? Mic : Pause} size={18} className="text-danger" />
        </Pressable>
        <Pressable onPress={onSend} accessibilityRole="button" accessibilityLabel="Send voice message" className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent active:bg-accent-hover">
          <Icon as={Send} size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    );
  }

  if (locked) {
    // Original layout (Rooms): discard · waveform · pause/resume · stop-to-preview.
    return (
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Discard recording" className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10">
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
  const willCancel = cancelProgress > 0.7;

  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      {/* Lock capsule — fills and tints as the finger slides up toward it. */}
      <View
        pointerEvents="none"
        className={`absolute items-center gap-1 rounded-full border px-2.5 py-2.5 ${lockProgress >= 1 ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
        style={{ right: 17, bottom: 58, opacity: 0.55 + lockProgress * 0.45, transform: [{ translateY: -lockProgress * 10 }, { scale: 1 + lockProgress * 0.1 }] }}
      >
        <Icon as={Lock} size={16} className={lockProgress >= 1 ? "text-accent" : "text-ink-muted"} />
        <Icon as={ChevronUp} size={14} className="text-ink-muted" />
      </View>

      <PulseDot />
      <Text className="shrink-0 text-base text-ink">{formatVoiceDuration(elapsedMs / 1000)}</Text>

      <View className="min-w-0 flex-1 items-end pr-12">
        <Breathing>
          <View className="flex-row items-center gap-0.5" style={{ transform: [{ translateX: Math.max(-cancelThresholdPx, drag.x) }], opacity: 1 - cancelProgress * 0.85 }}>
            <Icon as={ChevronLeft} size={16} className={willCancel ? "text-danger" : "text-ink-muted"} />
            <Text className={`text-sm ${willCancel ? "text-danger" : "text-ink-muted"}`}>Slide to cancel</Text>
          </View>
        </Breathing>
      </View>

      {/* The mic swells under the finger and follows it, like WhatsApp's. */}
      <View
        pointerEvents="none"
        className={`absolute h-11 w-11 items-center justify-center rounded-full ${willCancel ? "bg-danger" : "bg-accent"}`}
        style={{
          right: 12,
          transform: [{ translateX: Math.max(-cancelThresholdPx, drag.x) }, { translateY: -Math.min(lockThresholdPx, Math.max(0, drag.y)) }, { scale: 1.3 }],
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        <Icon as={Mic} size={20} color="#FFFFFF" />
      </View>
    </View>
  );
}
