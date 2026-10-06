// src/components/messages/VoicePreviewBar.tsx
// After you release the mic: listen back, optionally mark view-once, then send or discard.
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pause, Play, Send, Trash2 } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { VoiceWaveform } from "@/components/ui/VoiceWaveform";
import { useDuckWhile } from "@/hooks/useDuckWhile";
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
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  useDuckWhile(status.playing);

  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0).catch(() => {});
  }, [status.didJustFinish, player]);

  function toggle() {
    try {
      if (status.playing) player.pause();
      else player.play();
    } catch {
      /* released */
    }
  }

  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Pressable
        onPress={onDiscard}
        accessibilityRole="button"
        accessibilityLabel="Discard recording"
        className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10"
      >
        <Icon as={Trash2} size={18} className="text-danger" />
      </Pressable>

      <View className="min-w-0 flex-1 flex-row items-center gap-2.5 rounded-full bg-surface py-1.5 pl-1.5 pr-2">
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pause preview" : "Play preview"}
          className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent"
        >
          <Icon as={status.playing ? Pause : Play} size={15} fill="#FFFFFF" className="text-white" />
        </Pressable>
        <VoiceWaveform
          levels={peaks.length ? peaks : flatPeaks()}
          progress={progress}
          filledColor="bg-accent"
          mutedColor="bg-ink-muted/25"
          onSeek={peaks.length ? (r) => void player.seekTo(r * total).catch(() => {}) : undefined}
        />
        <Text className="shrink-0 text-[11px] text-ink-muted">{formatVoiceDuration(status.playing || status.currentTime > 0 ? status.currentTime : durationSec)}</Text>
        {onToggleViewOnce ? (
          <Pressable
            onPress={onToggleViewOnce}
            accessibilityRole="switch"
            accessibilityState={{ checked: !!viewOnce }}
            accessibilityLabel={viewOnce ? "View once enabled — tap to allow replay" : "Enable view once"}
            className={`h-6 w-6 shrink-0 items-center justify-center rounded-full ${viewOnce ? "bg-accent" : "bg-ink-muted/15"}`}
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
        className={`shrink-0 rounded-full bg-accent p-2.5 ${sending ? "opacity-50" : ""}`}
      >
        <Icon as={Send} size={18} className="text-white" />
      </Pressable>
    </View>
  );
}
