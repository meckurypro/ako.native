// src/components/music/ClipSelector.tsx
//
// "Select the best part of the song" step of Publish Music to Akọ. Port of the web ClipSelector:
// real waveform (computed from the actually-decoded audio, never faked), a draggable selection
// window, preview playback, and a confirm step that slices + encodes the real derived clip.
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Minus, Pause, Play, Plus } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { computeBufferPeaks, decodeAudioFile, sliceAndEncodeWav, type DecodedAudio } from "@/lib/audioClip";
import type { LocalFile } from "@/lib/localFile";

const MIN_DURATION = 5;
const MAX_DURATION = 30;
const DURATION_STEP = 5;
const DEFAULT_DURATION = 30;

export interface ClipResult {
  startSeconds: number;
  durationSeconds: number;
  file: LocalFile;
}

interface ClipSelectorProps {
  /** URL of the source Audio Project file — decoded once. */
  audioUrl: string;
  onConfirm: (result: ClipResult) => void;
  onCancel: () => void;
}

export function ClipSelector({ audioUrl, onConfirm, onCancel }: ClipSelectorProps) {
  const [decoded, setDecoded] = useState<DecodedAudio | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [start, setStart] = useState(0);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [isEncoding, setIsEncoding] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  const player = useAudioPlayer(audioUrl, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;

  // Decode once on mount — real waveform, computed from the real file.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const audio = await decodeAudioFile(audioUrl);
        if (cancelled) return;
        setDecoded(audio);
        setDuration(Math.min(DEFAULT_DURATION, audio.durationSeconds));
        setStart(0);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error && err.message.includes("isn't available") ? err.message : "Couldn't load this track's audio. Try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  const peaks = useMemo(() => (decoded ? computeBufferPeaks(decoded.buffer) : []), [decoded]);
  const totalDuration = decoded?.durationSeconds ?? 0;

  // Leaving this step (closing the sheet, picking a different Project) must stop the preview.
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // player already released
      }
    };
  }, [player]);

  function clampStart(value: number, forDuration = duration) {
    return Math.max(0, Math.min(value, Math.max(0, totalDuration - forDuration)));
  }

  // Drag the window across the waveform. Pan only claims horizontal movement so the publish form's
  // own vertical scroll still works when a finger starts on the track.
  const startRef = useRef(start);
  startRef.current = start;
  const dragOrigin = useRef(0);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-6, 6])
        .failOffsetY([-14, 14])
        .onBegin(() => {
          dragOrigin.current = startRef.current;
        })
        .onUpdate((e) => {
          if (trackWidth <= 0) return;
          const deltaSeconds = (e.translationX / trackWidth) * totalDuration;
          setStart(Math.max(0, Math.min(dragOrigin.current + deltaSeconds, Math.max(0, totalDuration - duration))));
        }),
    [trackWidth, totalDuration, duration],
  );

  function adjustDuration(delta: number) {
    const next = Math.max(MIN_DURATION, Math.min(MAX_DURATION, duration + delta));
    setDuration(next);
    setStart((prev) => clampStart(prev, next));
  }

  async function togglePreview() {
    if (isPlaying) {
      player.pause();
      return;
    }
    await player.seekTo(start);
    player.play();
  }

  // Stop preview automatically at the end of the selected window — never plays past what the
  // audience would actually hear.
  useEffect(() => {
    if (isPlaying && status.currentTime >= start + duration) player.pause();
  }, [isPlaying, status.currentTime, start, duration, player]);

  function handleConfirm() {
    if (!decoded) return;
    setIsEncoding(true);
    try {
      const file = sliceAndEncodeWav(decoded.buffer, start, duration);
      onConfirm({ startSeconds: start, durationSeconds: duration, file });
    } catch {
      setLoadError("Couldn't prepare that clip. Try a different range.");
    } finally {
      setIsEncoding(false);
    }
  }

  const selectionLeftPct = totalDuration > 0 ? (start / totalDuration) * 100 : 0;
  const selectionWidthPct = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;

  return (
    <View className="px-4 py-4">
      <Text className="mb-1 font-display text-base text-ink">Pick the best 30 seconds</Text>
      <Text className="mb-4 text-xs text-ink-muted">Drag the highlighted section over the part you want people to hear.</Text>

      {loadError ? <Text className="mb-3 text-sm text-danger">{loadError}</Text> : null}

      {!decoded && !loadError ? <View className="h-20 rounded-xl border border-border bg-surface opacity-60" /> : null}

      {decoded ? (
        <>
          <View
            onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
            className="relative h-20 overflow-hidden rounded-xl border border-border bg-surface"
          >
            <View className="absolute inset-0 flex-row items-center gap-[1.5px] px-1">
              {peaks.map((p, i) => (
                <View key={i} className="flex-1 rounded-full bg-ink-muted-a30" style={{ height: `${Math.max(8, p * 100)}%` }} />
              ))}
            </View>

            <GestureDetector gesture={pan}>
              <View
                accessibilityRole="adjustable"
                accessibilityLabel={`Clip start ${Math.round(start)} seconds`}
                className="absolute inset-y-0 rounded-lg border-2 border-accent bg-accent-a25"
                style={{ left: `${selectionLeftPct}%`, width: `${selectionWidthPct}%` }}
              />
            </GestureDetector>
          </View>

          <View className="mt-3 flex-row items-center justify-between">
            <Pressable
              onPress={() => void togglePreview()}
              accessibilityRole="button"
              className="flex-row items-center gap-2 rounded-full bg-accent-soft px-4 py-2"
            >
              <Icon as={isPlaying ? Pause : Play} size={14} className="text-accent" />
              <Text className="text-sm font-medium text-accent">{isPlaying ? "Pause" : "Preview"}</Text>
            </Pressable>

            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => adjustDuration(-DURATION_STEP)}
                disabled={duration <= MIN_DURATION}
                accessibilityRole="button"
                accessibilityLabel="Shorter clip"
                className={`h-8 w-8 items-center justify-center rounded-full border border-border ${duration <= MIN_DURATION ? "opacity-40" : ""}`}
              >
                <Icon as={Minus} size={14} className="text-ink-muted" />
              </Pressable>
              <Text className="w-16 text-center text-sm text-ink" style={{ fontVariant: ["tabular-nums"] }}>
                {Math.round(duration)}s
              </Text>
              <Pressable
                onPress={() => adjustDuration(DURATION_STEP)}
                disabled={duration >= MAX_DURATION || duration >= totalDuration}
                accessibilityRole="button"
                accessibilityLabel="Longer clip"
                className={`h-8 w-8 items-center justify-center rounded-full border border-border ${duration >= MAX_DURATION || duration >= totalDuration ? "opacity-40" : ""}`}
              >
                <Icon as={Plus} size={14} className="text-ink-muted" />
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

      <View className="mt-5 flex-row gap-3">
        <Pressable onPress={onCancel} accessibilityRole="button" className="flex-1 items-center rounded-full border border-border py-3">
          <Text className="text-sm font-medium text-ink">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleConfirm}
          disabled={!decoded || isEncoding}
          accessibilityRole="button"
          className={`flex-1 items-center rounded-full bg-accent py-3 ${!decoded || isEncoding ? "opacity-50" : ""}`}
        >
          <Text className="text-sm font-medium text-canvas">{isEncoding ? "Preparing…" : "Use this clip"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
