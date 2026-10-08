// src/components/project/LessonMedia.tsx
// Plays a course lesson's media_url: YouTube / Vimeo embeds in a WebView, direct
// video files in a native expo-video player (fires onWatched when it finishes),
// anything else as an "Open lesson video" link.
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { PlayCircle } from "lucide-react-native";
import { useEffect } from "react";
import { Linking, Pressable, View } from "react-native";
import { WebView } from "react-native-webview";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useDuckWhile } from "@/hooks/useDuckWhile";
import { APP_URL } from "@/lib/config";

type EmbedKind = { type: "youtube" | "vimeo"; embedUrl: string } | { type: "video" } | { type: "link" };

export function resolveEmbed(url: string): EmbedKind {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/);
  if (yt) return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${yt[1]}?playsinline=1` };
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeo[1]}` };
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) return { type: "video" };
  return { type: "link" };
}

function DirectVideo({ url, onWatched }: { url: string; onWatched: () => void }) {
  const player = useVideoPlayer(url);
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

export function LessonMedia({ url, onWatched }: { url: string; onWatched: () => void }) {
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

  if (embed.type === "video") return <DirectVideo url={url} onWatched={onWatched} />;

  return (
    <Pressable onPress={() => void Linking.openURL(url)} accessibilityRole="link" className="mb-2 flex-row items-center gap-1.5 self-start">
      <Icon as={PlayCircle} size={15} className="text-accent" />
      <Text className="text-sm font-medium text-accent">Open lesson video</Text>
    </Pressable>
  );
}
