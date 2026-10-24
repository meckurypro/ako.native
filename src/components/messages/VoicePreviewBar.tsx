// src/components/messages/VoicePreviewBar.tsx
// After you release the mic: listen back, optionally mark view-once, then send or discard.
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pause, Play, Send, Trash2 } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { VoiceWaveform } from "@/components/ui/VoiceWaveform";
import { useDuckWhile } from "@/hooks/useDuckWhile";
import { enterVoicePlaybackMode, leaveVoicePlaybackMode } from "@/lib/voiceAudioSession";
import { formatVoiceDuration } from "@/lib/voiceNotes";
import { flatPeaks } from "@/lib/waveform";

interface VoicePreviewBarProps {
  url: string;
  durationSec: number;
  peaks: number[];
  sending: boolean;
  viewOnce?: boolean;
  onToggleViewOnce?: () => void;
  onDiscard: () => void;
  onSend: () => void;
}

export function VoicePreviewBar({ url, durationSec, peaks, sending, viewOnce, onToggleViewOnce, onDiscard, onSend }: VoicePreviewBarProps) {
  const player = useAudioPlayer(url, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration : durationSec;
  const [scrub, setScrub] = useState<number | null>(null);
  const progress = scrub ?? (total > 0 ? Math.min(1, status.currentTime / total) : 0);
  const shownTime = scrub !== null ? scrub * total : status.currentTime;
  const inPlaybackMode = useRef(false);

  useDuckWhile(status.playing);

  const release = () => {
    if (!inPlaybackMode.current) return;
    inPlaybackMode.current = false;
    leaveVoicePlaybackMode();
  };

  useEffect(() => {
    if (status.didJustFinish) {
      void player.seekTo(0).catch(() => {});
      release();
    }
  }, [status.didJustFinish, player]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => release, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    try {
      if (status.playing) {
        player.pause();
        release();
        return;
      }
    } catch {
      /* released */
    }
    // Audible on silent/vibrate, like WhatsApp (see lib/voiceAudioSession.ts).
    const ready = inPlaybackMode.current ? Promise.resolve() : enterVoicePlaybackMode();
    inPlaybackMode.current = true;
    void ready.then(() => {
      try {
        player.muted = false;
        player.volume = 1;
        player.play();
      } catch {
        /* released */
      }
    });
  }

  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Pressable
        onPress={onDiscard}
        accessibilityRole="button"
        accessibilityLabel="Discard recording"
        className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-a10"
      >
        <Icon as={Trash2} size={18} className="text-danger" />
      </Pressable>

      <View className="min-w-0 flex-1 flex-row items-center gap-2.5 rounded-full bg-surface py-1.5 pl-1.5 pr-2">
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pause preview" : "Play preview"}
          className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cta"
        >
          <Icon as={status.playing ? Pause : Play} size={15} fill="#FFFFFF" className="text-white" />
        </Pressable>
        <VoiceWaveform
          levels={peaks.length ? peaks : flatPeaks()}
          progress={progress}
          filledColor="bg-accent"
          mutedColor="bg-ink-muted-a25"
          thumbColor="bg-tick-blue"
          onSeek={(r) => void player.seekTo(r * total).catch(() => {})}
          onScrub={setScrub}
        />
        <Text className="shrink-0 text-[11px] text-ink-muted">{formatVoiceDuration(status.playing || shownTime > 0 ? shownTime : durationSec)}</Text>
        {onToggleViewOnce ? (
          <Pressable
            onPress={onToggleViewOnce}
            accessibilityRole="switch"
            accessibilityState={{ checked: !!viewOnce }}
            accessibilityLabel={viewOnce ? "View once enabled — tap to allow replay" : "Enable view once"}
            className={`h-6 w-6 shrink-0 items-center justify-center rounded-full ${viewOnce ? "bg-cta" : "bg-ink-muted-a15"}`}
          >
            <Text className={`text-[11px] font-bold ${viewOnce ? "text-white" : "text-ink-muted"}`}>1</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={onSend}
        disabled={sending}
        accessibilityRole="button"
        accessibilityLabel="Send voice message"
        className={`shrink-0 rounded-full bg-cta p-2.5 ${sending ? "opacity-50" : ""}`}
      >
        <Icon as={Send} size={18} className="text-white" />
      </Pressable>
    </View>
  );
}
