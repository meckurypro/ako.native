// src/components/messages/VoiceMessageBubble.tsx
// Voice note inside a chat bubble, laid out like WhatsApp: a plain play triangle, a blue scrub dot riding a
// fine waveform you can tap or drag to scrub, duration under the dot and time + ticks at the far end, and the
// sender's photo on the opposite side with a small mic (received: [play][wave][photo]; sent: [photo][play][wave]).
// Also tap-to-cycle playback speed (1x/1.5x/2x), view-once handling, and resume-where-you-left-off. Only one voice note plays at a time, and UI
// sounds duck underneath it. Audio is signed on demand when only a storage
// path is available.
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { EyeOff, Mic, Pause, Play } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { VoiceWaveform } from "@/components/ui/VoiceWaveform";
import { useDuckWhile } from "@/hooks/useDuckWhile";
import { getSignedAudioUrl } from "@/lib/signedAudioUrl";
import { enterVoicePlaybackMode, leaveVoicePlaybackMode } from "@/lib/voiceAudioSession";
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

  const { colors } = useTheme();
  const [scrub, setScrub] = useState<number | null>(null);
  // Playback must be audible on silent/vibrate (see lib/voiceAudioSession.ts) — held only while playing.
  const inPlaybackMode = useRef(false);
  const releasePlaybackMode = useCallback(() => {
    if (!inPlaybackMode.current) return;
    inPlaybackMode.current = false;
    leaveVoicePlaybackMode();
  }, []);

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
    releasePlaybackMode();
    clearPlaying(pause);
  }, [player, stableKey, releasePlaybackMode]);

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
    releasePlaybackMode();
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
      releasePlaybackMode();
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
    setHasStarted(true);
    if (!played) {
      markPlayed(stableKey);
      setPlayed(true);
    }
    // Switch the audio session to media playback FIRST (silent-mode safe), then start.
    const ready = inPlaybackMode.current ? Promise.resolve() : enterVoicePlaybackMode();
    inPlaybackMode.current = true;
    void ready.then(() => {
      try {
        player.muted = false;
        player.volume = 1;
        player.setPlaybackRate(speed);
        player.play();
      } catch {
        /* released */
      }
    });
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
  // Received waveforms are neutral grey-blue like WhatsApp; sent ones sit on the accent bubble in white.
  const filledColor = isMine ? "bg-white-a70" : "bg-ink-muted";
  const mutedColor = isMine ? "bg-white-a35" : "bg-ink-muted-a40";
  const showSpeed = playing || (hasStarted && elapsed > 0);
  const shownProgress = scrub ?? progress;
  const shownElapsed = scrub !== null ? scrub * total : elapsed;
  const iconColor = isMine ? "#FFFFFFCC" : colors.inkMuted;
  // Received + not yet listened → accent mic; once played it turns blue (WhatsApp's green → blue).
  const micColor = isMine ? iconColor : played ? colors.tickBlue : colors.accent;

  if (spent) {
    return (
      <View className="flex-row items-center gap-2 py-0.5">
        <Icon as={EyeOff} size={15} className={isMine ? "text-white-a70" : "text-ink-muted"} />
        <Text className={`text-sm italic ${isMine ? "text-white-a70" : "text-ink-muted"}`}>Opened</Text>
      </View>
    );
  }

  // The photo slot: while a note plays, the speed chip takes its place (as in WhatsApp).
  const photoSlot = showSpeed ? (
    <Pressable
      onPress={cycleSpeed}
      accessibilityRole="button"
      accessibilityLabel={`Playback speed, currently ${speed}x. Tap to change.`}
      hitSlop={6}
      className={`h-12 w-12 shrink-0 items-center justify-center rounded-full ${isMine ? "bg-white-a25" : "bg-accent-a12"}`}
    >
      <Text className={`text-sm font-bold ${isMine ? "text-white" : "text-accent"}`}>{speed}x</Text>
    </Pressable>
  ) : senderAvatarUrl !== undefined ? (
    <View className="shrink-0">
      <Avatar src={senderAvatarUrl} name={senderName ?? "?"} size="vn" />
      {/* The mic hangs off the photo's lower inner corner, outside the circle, like WhatsApp. */}
      <View pointerEvents="none" className={`absolute -bottom-1 ${isMine ? "-right-2.5" : "-left-2.5"}`}>
        <Icon as={Mic} size={19} color={micColor} strokeWidth={2.4} />
      </View>
    </View>
  ) : null;

  return (
    <View className="w-[264px] max-w-full flex-row items-center gap-2 py-1">
      {isMine ? photoSlot : null}

      <Pressable
        onPress={toggle}
        disabled={!resolvedUrl}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause voice message" : "Play voice message"}
        className={`h-10 w-8 shrink-0 items-center justify-center ${!resolvedUrl ? "opacity-40" : ""}`}
      >
        <Icon as={playing ? Pause : Play} size={30} color={iconColor} fill={iconColor} />
      </Pressable>

      <View className="min-w-0 flex-1">
        <VoiceWaveform
          levels={barLevels}
          progress={shownProgress}
          filledColor={filledColor}
          mutedColor={mutedColor}
          thumbColor="bg-tick-blue"
          onSeek={seek}
          onScrub={setScrub}
        />
        <View className="-mt-1 flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-1">
            {viewOnce ? (
              <View className={`h-3.5 w-3.5 items-center justify-center rounded-full ${isMine ? "bg-white-a25" : "bg-accent-a15"}`} accessibilityLabel="View once">
                <Text className={`text-[9px] font-bold ${isMine ? "text-white" : "text-accent"}`}>1</Text>
              </View>
            ) : null}
            <Text className={`text-[12px] ${isMine ? "text-white-a70" : "text-ink-muted"}`}>
              {formatVoiceDuration(showSpeed || shownElapsed > 0 ? shownElapsed : durationSec)}
            </Text>
          </View>
          {footer}
        </View>
      </View>

      {!isMine ? photoSlot : null}
    </View>
  );
}
