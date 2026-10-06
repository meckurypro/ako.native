// src/components/project/MediaHeroPlayer.tsx
// The card's thumbnail for a Media project that has audio or video: tap to play
// a 30-second looping preview (video plays in place; audio plays under the
// artwork), with a progress strip. Locked when you don't have access. Pauses
// itself the moment its card leaves the screen.
import { useAudioPlayer } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image as ImageIcon, Lock, Music, Pause, Play, Video } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useDuckWhile } from "@/hooks/useDuckWhile";

export const PREVIEW_SECONDS = 30;

interface MediaHeroPlayerProps {
  kind: "audio" | "video";
  thumbnailUrl: string | null;
  hasAccess: boolean;
  previewSrc: string | null;
  isLoadingPreview: boolean;
  onLoadPreview: () => void;
  autoLoadOnMount: boolean;
  /** False once the card scrolls off-screen — playback stops. */
  visible: boolean;
}

export function MediaHeroPlayer({ kind, thumbnailUrl, hasAccess, previewSrc, isLoadingPreview, onLoadPreview, autoLoadOnMount, visible }: MediaHeroPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const requestedRef = useRef(false);

  const audioPlayer = useAudioPlayer(kind === "audio" ? previewSrc : null);
  const videoPlayer = useVideoPlayer(kind === "video" ? previewSrc : null, (p) => {
    p.loop = true;
  });

  const control = useCallback(
    (action: "play" | "pause" | "restart") => {
      try {
        if (kind === "audio") {
          if (action === "restart") void audioPlayer.seekTo(0);
          else if (action === "play") audioPlayer.play();
          else audioPlayer.pause();
        } else {
          if (action === "restart") videoPlayer.currentTime = 0;
          else if (action === "play") videoPlayer.play();
          else videoPlayer.pause();
        }
      } catch {
        /* player released */
      }
    },
    [kind, audioPlayer, videoPlayer]
  );

  useDuckWhile(isPlaying);

  useEffect(() => {
    if (!autoLoadOnMount || !hasAccess || previewSrc || requestedRef.current) return;
    requestedRef.current = true;
    onLoadPreview();
  }, [autoLoadOnMount, hasAccess, previewSrc, onLoadPreview]);

  // A freshly loaded preview starts playing from the top.
  useEffect(() => {
    if (!previewSrc) return;
    control("restart");
    control("play");
    setIsPlaying(true);
  }, [previewSrc, control]);

  useEffect(() => {
    if (!visible && isPlaying) {
      control("pause");
      setIsPlaying(false);
    }
  }, [visible, isPlaying, control]);

  // Progress + the 30-second loop point.
  useEffect(() => {
    if (!previewSrc) return;
    const timer = setInterval(() => {
      try {
        const t = kind === "audio" ? audioPlayer.currentTime : videoPlayer.currentTime;
        if (t >= PREVIEW_SECONDS) {
          control("restart");
          setElapsed(0);
        } else {
          setElapsed(t);
        }
      } catch {
        /* released */
      }
    }, 250);
    return () => clearInterval(timer);
  }, [previewSrc, kind, audioPlayer, videoPlayer, control]);

  function toggle() {
    if (!previewSrc) return onLoadPreview();
    if (isPlaying) {
      control("pause");
      setIsPlaying(false);
    } else {
      control("play");
      setIsPlaying(true);
    }
  }

  if (!hasAccess) {
    return (
      <View className="h-full w-full">
        {thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} contentFit="cover" style={{ width: "100%", height: "100%", opacity: 0.5 }} />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Icon as={ImageIcon} size={32} className="text-ink-muted" />
          </View>
        )}
        <View className="absolute inset-0 items-center justify-center gap-1.5 bg-ink/40">
          <Icon as={Lock} size={20} className="text-canvas" />
          <Text className="text-xs font-medium text-canvas">{kind === "video" ? "Video locked" : "Audio locked"}</Text>
        </View>
      </View>
    );
  }

  const progressPct = previewSrc ? Math.min(100, (elapsed / PREVIEW_SECONDS) * 100) : 0;
  const elapsedSeconds = Math.min(PREVIEW_SECONDS, Math.floor(elapsed));
  const isBusy = isLoadingPreview && !previewSrc;

  return (
    <Pressable
      onPress={toggle}
      disabled={isBusy}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? `Pause ${kind}` : `Play ${kind}`}
      className="h-full w-full"
    >
      {kind === "video" && previewSrc ? (
        <VideoView player={videoPlayer} contentFit="cover" nativeControls={false} style={{ width: "100%", height: "100%" }} />
      ) : thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} contentFit="cover" transition={150} style={{ width: "100%", height: "100%" }} />
      ) : (
        <View className="h-full w-full items-center justify-center">
          <Icon as={kind === "video" ? Video : Music} size={32} className="text-ink-muted" />
        </View>
      )}

      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-ink/60">
          {isBusy ? <ActivityIndicator color="#F7F4EF" /> : <Icon as={isPlaying ? Pause : Play} size={22} fill="#F7F4EF" className="text-canvas" />}
        </View>
      </View>

      {previewSrc ? (
        <View pointerEvents="none" className="absolute inset-x-2 bottom-2 flex-row items-center gap-2">
          <View className="h-1 flex-1 overflow-hidden rounded-full bg-canvas/40">
            <View className="h-full bg-canvas" style={{ width: `${progressPct}%` }} />
          </View>
          <Text className="shrink-0 text-[10px] text-canvas">
            {elapsedSeconds}s/{PREVIEW_SECONDS}s
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
