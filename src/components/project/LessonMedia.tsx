// src/components/project/LessonMedia.tsx
// Plays a course lesson's media_url: YouTube / Vimeo embeds in a WebView, direct
// video files in a native expo-video player (fires onWatched when it finishes),
// anything else as an "Open lesson video" link.
import { useEvent } from "expo";
import { useVideoPlayer } from "expo-video";
import { SafeVideoView } from "../ui/SafeVideoView";
import { PlayCircle } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { WebView } from "react-native-webview";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useDuckWhile } from "@/hooks/useDuckWhile";
import { APP_URL } from "@/lib/config";
import { resolveEmbed } from "@/lib/courseTypes";
import { signedCourseVideoUrl } from "@/lib/courseVideo";
import { openExternal } from "@/lib/openExternal";

// Which kind of media a pasted link is lives in lib/courseTypes.ts, shared with the web app and unit-tested: hosts are
// matched from the start of the URL and anything that isn't a plain http(s) link resolves to "none".

function DirectVideo({
  url,
  onWatched,
  startAt,
  onTime,
  portrait = false,
}: {
  url: string;
  onWatched: () => void;
  startAt?: number | null;
  onTime?: (seconds: number) => void;
  /** 9:16 video: shown as a tall frame that fills; full screen simply fills the screen. */
  portrait?: boolean;
}) {
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
    <View
      className={`mb-2 overflow-hidden rounded-xl bg-black ${portrait ? "self-center" : "aspect-video w-full"}`}
      style={portrait ? { aspectRatio: 9 / 16, width: "62%" } : undefined}
    >
      <SafeVideoView
        player={player}
        nativeControls
        contentFit={portrait ? "cover" : "contain"}
        fullscreenOptions={{ enable: true }}
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}

/** A video uploaded to the private course-videos bucket: fetches a signed link, then plays it like any direct video. */
export function UploadedVideo({
  path,
  width,
  height,
  onWatched,
  startAt,
  onTime,
}: {
  path: string;
  width?: number | null;
  height?: number | null;
  onWatched: () => void;
  startAt?: number | null;
  onTime?: (seconds: number) => void;
}) {
  const signed = useQuery({ queryKey: ["course-video-url", path], queryFn: () => signedCourseVideoUrl(path), staleTime: 5 * 3600_000, retry: 1 });
  if (signed.isError) {
    return (
      <View className="mb-2 aspect-video w-full items-center justify-center rounded-xl bg-surface px-4">
        <Text className="text-center text-sm text-ink-muted">This video isn't available right now.</Text>
      </View>
    );
  }
  if (!signed.data) return <View className="mb-2 aspect-video w-full rounded-xl bg-surface" />;
  const portrait = !!width && !!height && height > width;
  return <DirectVideo url={signed.data} onWatched={onWatched} startAt={startAt} onTime={onTime} portrait={portrait} />;
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

  // A stored link that isn't a plain http(s) URL (script, intent:, tel: …) is never played or opened.
  if (embed.type === "none") return null;

  if (embed.type === "youtube" || embed.type === "vimeo") {
    return (
      <View className="mb-2 aspect-video w-full overflow-hidden rounded-xl bg-canvas">
        <WebView
          // key: switching lessons must tear the page down, not navigate it in place.
          key={embed.embedUrl}
          // YouTube rejects embeds that carry no referrer (error 153), so send the app origin.
          source={{ uri: embed.type === "youtube" ? `${embed.embedUrl}?playsinline=1` : embed.embedUrl, headers: APP_URL ? { Referer: `${APP_URL}/` } : undefined }}
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

  if (embed.type === "video") return <DirectVideo url={embed.url} onWatched={onWatched} startAt={startAt} onTime={onTime} />;

  if (embed.type !== "link") return null;
  return (
    <Pressable onPress={() => void openExternal(embed.url)} accessibilityRole="link" className="mb-2 flex-row items-center gap-1.5 self-start">
      <Icon as={PlayCircle} size={15} className="text-accent" />
      <Text className="text-sm font-medium text-accent">Open lesson video</Text>
    </Pressable>
  );
}
