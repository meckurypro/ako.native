// src/components/messages/VoiceMessageBubble.tsx
// Voice note inside a chat bubble: play/pause, tap-to-seek waveform, elapsed
// time, tap-to-cycle playback speed (1x/1.5x/2x), view-once handling, and
// resume-where-you-left-off. Only one voice note plays at a time, and UI
// sounds duck underneath it. Audio is signed on demand when only a storage
// path is available.
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { EyeOff, Mic, Pause, Play } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { VoiceWaveform } from "@/components/ui/VoiceWaveform";
import { useDuckWhile } from "@/hooks/useDuckWhile";
import { getSignedAudioUrl } from "@/lib/signedAudioUrl";
import { flatPeaks } from "@/lib/waveform";
import { formatVoiceDuration } from "@/lib/voiceNotes";
import {
  announcePlaying,
  clearPlaying,
  clearRememberedPosition,
  getPreferredPlaybackSpeed,
  getRememberedPosition,
  hasPlayed,
  markPlayed,
  nextPlaybackSpeed,
  setPreferredPlaybackSpeed,
  setRememberedPosition,
  type PlaybackSpeed,
} from "@/lib/voicePlayback";

interface VoiceMessageBubbleProps {
  url?: string;
  path?: string;
  durationSec: number;
  peaks?: number[];
  isMine: boolean;
  viewOnce?: boolean;
  openedOnceAt?: string | null;
  onOpened?: () => void;
  senderAvatarUrl?: string | null;
  senderName?: string;
  /** Time + ticks, drawn at the right end of the duration row (chat bubbles; Rooms leave it out). */
  footer?: ReactNode;
}

export function VoiceMessageBubble({
  url,
  path,
  durationSec,
  peaks,
  isMine,
  viewOnce,
  openedOnceAt,
  onOpened,
  senderAvatarUrl,
  senderName,
  footer,
}: VoiceMessageBubbleProps) {
  const stableKey = path ?? url ?? "";
  const enforceViewOnce = !!viewOnce && !isMine;
  const spent = enforceViewOnce && !!openedOnceAt;

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(url ?? null);
  const [speed, setSpeed] = useState<PlaybackSpeed>(() => getPreferredPlaybackSpeed());
  const [hasStarted, setHasStarted] = useState(false);
  const [played, setPlayed] = useState(() => hasPlayed(stableKey));

  useEffect(() => {
    if (url) {
      setResolvedUrl(url);
      return;
    }
    if (!path) return;
    let cancelled = false;
    getSignedAudioUrl(path).then((signed) => {
      if (!cancelled) setResolvedUrl(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [url, path]);

  const player = useAudioPlayer(resolvedUrl ?? null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const total = status.duration > 0 ? status.duration : durationSec;
  const elapsed = status.currentTime;
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;

  useDuckWhile(playing);

  const pause = useCallback(() => {
    try {
      if (player.currentTime > 0 && player.currentTime < (player.duration || Infinity)) setRememberedPosition(stableKey, player.currentTime);
      player.pause();
    } catch {
      /* released */
    }
    clearPlaying(pause);
  }, [player, stableKey]);

  // Resume where the user left off when this note scrolls back into use.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !status.isLoaded) return;
    restored.current = true;
    const remembered = getRememberedPosition(stableKey);
    if (remembered > 0 && remembered < status.duration) {
      void player.seekTo(remembered).catch(() => {});
      setHasStarted(true);
    }
  }, [status.isLoaded, status.duration, player, stableKey]);

  // Reached the end → reset, forget the position, and (for someone else's view-once note) mark it spent.
  useEffect(() => {
    if (!status.didJustFinish) return;
    clearRememberedPosition(stableKey);
    setHasStarted(false);
    void player.seekTo(0).catch(() => {});
    clearPlaying(pause);
    if (enforceViewOnce) onOpened?.();
  }, [status.didJustFinish]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the screen mid-note: remember the position and stop.
  useEffect(
    () => () => {
      try {
        if (player.playing) {
          if (player.currentTime > 0 && player.currentTime < (player.duration || Infinity)) setRememberedPosition(stableKey, player.currentTime);
          player.pause();
        }
      } catch {
        /* released */
      }
      clearPlaying(pause);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function toggle() {
    if (!resolvedUrl) return;
    if (playing) {
      pause();
      return;
    }
    announcePlaying(pause);
    try {
      player.setPlaybackRate(speed);
      player.play();
      setHasStarted(true);
      if (!played) {
        markPlayed(stableKey);
        setPlayed(true);
      }
    } catch {
      /* released */
    }
  }

  function seek(ratio: number) {
    if (!total) return;
    void player.seekTo(ratio * total).catch(() => {});
    setHasStarted(true);
    if (playing) setRememberedPosition(stableKey, ratio * total);
  }

  function cycleSpeed() {
    const next = nextPlaybackSpeed(speed);
    setSpeed(next);
    setPreferredPlaybackSpeed(next);
    try {
      player.setPlaybackRate(next);
    } catch {
      /* released */
    }
  }

  const barLevels = peaks?.length ? peaks : flatPeaks();
  const mutedColor = isMine ? "bg-white/35" : "bg-ink-muted/25";
  const filledColor = isMine ? "bg-white" : "bg-accent";
  const showSpeed = playing || (hasStarted && elapsed > 0);

  if (spent) {
    return (
      <View className="flex-row items-center gap-2 py-0.5">
        <Icon as={EyeOff} size={15} className={isMine ? "text-white/70" : "text-ink-muted"} />
        <Text className={`text-sm italic ${isMine ? "text-white/70" : "text-ink-muted"}`}>Opened</Text>
      </View>
    );
  }

  // Received + not yet listened → accent mic; once played it turns blue (WhatsApp's green → blue).
  const badgeBg = isMine ? "bg-white" : played ? "bg-tick-blue" : "bg-accent";

  return (
    <View className="min-w-[230px] flex-row items-center gap-2 py-0.5">
      {/* Leading slot: while a note is playing, the speed chip takes the avatar's place (as in WhatsApp). */}
      {showSpeed ? (
        <Pressable
          onPress={cycleSpeed}
          accessibilityRole="button"
          accessibilityLabel={`Playback speed, currently ${speed}x. Tap to change.`}
          hitSlop={6}
          className={`h-10 w-10 shrink-0 items-center justify-center rounded-full ${isMine ? "bg-white/25" : "bg-accent/12"}`}
        >
          <Text className={`text-xs font-bold ${isMine ? "text-white" : "text-accent"}`}>{speed}x</Text>
        </Pressable>
      ) : senderAvatarUrl !== undefined ? (
        <View className="shrink-0">
          <Avatar src={senderAvatarUrl} name={senderName ?? "?"} size="sm" />
          <View className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 items-center justify-center rounded-full ${badgeBg}`}>
            <Icon as={Mic} size={9} className={isMine ? "text-accent" : "text-white"} />
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={toggle}
        disabled={!resolvedUrl}
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause voice message" : "Play voice message"}
        className={`h-9 w-9 shrink-0 items-center justify-center rounded-full ${isMine ? "bg-white" : "bg-accent"} ${!resolvedUrl ? "opacity-50" : ""}`}
      >
        <Icon as={playing ? Pause : Play} size={15} fill={isMine ? "#3D5A45" : "#FFFFFF"} className={isMine ? "text-accent" : "text-white"} />
      </Pressable>

      <View className="min-w-0 flex-1">
        <VoiceWaveform levels={barLevels} progress={progress} filledColor={filledColor} mutedColor={mutedColor} onSeek={seek} thumbColor={filledColor} />
        <View className="mt-0.5 flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-1">
            {viewOnce ? (
              <View className={`h-3.5 w-3.5 items-center justify-center rounded-full ${isMine ? "bg-white/25" : "bg-accent/15"}`} accessibilityLabel="View once">
                <Text className={`text-[9px] font-bold ${isMine ? "text-white" : "text-accent"}`}>1</Text>
              </View>
            ) : null}
            <Text className={`text-[11px] opacity-80 ${isMine ? "text-white" : "text-ink"}`}>{formatVoiceDuration(showSpeed || elapsed > 0 ? elapsed : durationSec)}</Text>
          </View>
          {footer}
        </View>
      </View>
    </View>
  );
}
