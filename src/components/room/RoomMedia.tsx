// src/components/room/RoomMedia.tsx
// Media attached to a classroom post or an assignment submission: video (native player),
// image, or audio (play/pause + progress).
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { Pause, Play } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useDuckWhile } from "@/hooks/useDuckWhile";
import { formatVoiceDuration } from "@/lib/voiceNotes";

function RoomVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return (
    <View className="mt-1 aspect-video w-full overflow-hidden rounded-lg bg-canvas">
      <VideoView player={player} nativeControls fullscreenOptions={{ enable: true }} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

function RoomImage({ url }: { url: string }) {
  const [ratio, setRatio] = useState(4 / 3);
  return (
    <Image
      source={url}
      contentFit="cover"
      className="mt-1 w-full rounded-lg"
      style={{ aspectRatio: ratio }}
      onLoad={(e) => e.source.width && e.source.height && setRatio(e.source.width / e.source.height)}
    />
  );
}

function RoomAudio({ url }: { url: string }) {
  const player = useAudioPlayer(url, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  useDuckWhile(status.playing);
  const pct = status.duration > 0 ? Math.min(100, (status.currentTime / status.duration) * 100) : 0;
  return (
    <View className="mt-1 flex-row items-center gap-3 rounded-lg border border-border bg-canvas px-3 py-2">
      <Pressable
        onPress={() => {
          if (status.playing) player.pause();
          else {
            if (status.duration > 0 && status.currentTime >= status.duration) void player.seekTo(0);
            player.play();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pause" : "Play"}
        hitSlop={8}
      >
        <Icon as={status.playing ? Pause : Play} size={18} className="text-accent" />
      </Pressable>
      <View className="h-1 flex-1 overflow-hidden rounded-full bg-border">
        <View className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </View>
      <Text className="text-xs text-ink-muted">{formatVoiceDuration(Math.round(status.duration > 0 ? status.duration : 0))}</Text>
    </View>
  );
}

export function RoomMedia({ kind, url }: { kind: "video" | "image" | "audio" | "text" | "voice_note"; url: string }) {
  if (kind === "video") return <RoomVideo url={url} />;
  if (kind === "image") return <RoomImage url={url} />;
  if (kind === "audio") return <RoomAudio url={url} />;
  return null;
}
