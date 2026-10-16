// src/components/project/LessonMedia.tsx
// Plays a course lesson's media_url: YouTube / Vimeo embeds in a WebView, direct
// video files in a native expo-video player (fires onWatched when it finishes),
// anything else as an "Open lesson video" link.
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { PlayCircle } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { WebView } from "react-native-webview";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useDuckWhile } from "@/hooks/useDuckWhile";
import { APP_URL } from "@/lib/config";
import { openExternal } from "@/lib/openExternal";

type EmbedKind = { type: "youtube" | "vimeo"; embedUrl: string } | { type: "video" } | { type: "link" };

export function resolveEmbed(url: string): EmbedKind {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
  if (yt) return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${yt[1]}?playsinline=1` };
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeo[1]}` };
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) return { type: "video" };
  return { type: "link" };
}

function DirectVideo({ url, onWatched, startAt, onTime }: { url: string; onWatched: () => void; startAt?: number | null; onTime?: (seconds: number) => void }) {
  const player = useVideoPlayer(url);
  const seeked = useRef(false);

  // Resume: jump to where the learner stopped, once, as soon as the video can play.
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status !== "readyToPlay" || seeked.current) return;
      seeked.current = true;
      if (startAt && startAt > 1) player.currentTime = startAt;
    });
    return () => sub.remove();
  }, [player, startAt]);

  // Report the playback position every few seconds so it can be saved.
  useEffect(() => {
    if (!onTime) return;
    player.timeUpdateEventInterval = 4;
    const sub = player.addListener("timeUpdate", ({ currentTime }) => onTime(currentTime));
    return () => sub.remove();
  }, [player, onTime]);

  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  useDuckWhile(isPlaying);

  useEffect(() => {
    const sub = player.addListener("playToEnd", onWatched);
    return () => sub.remove();
  }, [player, onWatched]);

  return (
    <View className="mb-2 aspect-video w-full overflow-hidden rounded-xl bg-canvas">
      <VideoView player={player} nativeControls fullscreenOptions={{ enable: true }} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

export function LessonMedia({
  url,
  onWatched,
  startAt,
  onTime,
}: {
  url: string;
  onWatched: () => void;
  /** Direct video only: second to resume from. (YouTube/Vimeo embeds can't be seeked or read from here.) */
  startAt?: number | null;
  /** Direct video only: called every few seconds with the playback position. */
  onTime?: (seconds: number) => void;
}) {
  const embed = resolveEmbed(url);

  if (embed.type === "youtube" || embed.type === "vimeo") {
    return (
      <View className="mb-2 aspect-video w-full overflow-hidden rounded-xl bg-canvas">
        <WebView
          // key: switching lessons must tear the page down, not navigate it in place.
          key={embed.embedUrl}
          // YouTube rejects embeds that carry no referrer (error 153), so send the app origin.
          source={{ uri: embed.embedUrl, headers: APP_URL ? { Referer: `${APP_URL}/` } : undefined }}
          style={{ flex: 1, backgroundColor: "transparent" }}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          originWhitelist={["https://*"]}
          accessibilityLabel="Lesson video"
        />
      </View>
    );
  }

  if (embed.type === "video") return <DirectVideo url={url} onWatched={onWatched} startAt={startAt} onTime={onTime} />;

  return (
    <Pressable onPress={() => void openExternal(url)} accessibilityRole="link" className="mb-2 flex-row items-center gap-1.5 self-start">
      <Icon as={PlayCircle} size={15} className="text-accent" />
      <Text className="text-sm font-medium text-accent">Open lesson video</Text>
    </Pressable>
  );
}
