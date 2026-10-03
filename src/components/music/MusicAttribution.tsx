// src/components/music/MusicAttribution.tsx
// The music credit row under a post: ♪ title · artist · feat. …, plus a mute
// toggle. The clip plays while its post is actually on screen (`active`) — the
// native stand-in for the web's IntersectionObserver at 60% visibility — and
// stops the moment it scrolls away, the app is backgrounded, or the component
// unmounts. Only one feed clip plays at a time (feedAudioPlayback), and UI
// sounds duck underneath it.
import { useAudioPlayer } from "expo-audio";
import { Music2, Volume2, VolumeX } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useMusicCatalogueEntry, useRecordMusicUsageEvent } from "@/hooks/useMusicCatalogue";
import { duckAudioBus, unduckAudioBus } from "@/lib/audioBus";
import { announceMusicPlaying, clearMusicPlaying } from "@/lib/feedAudioPlayback";
import { fadeInAndPlay, fadeOutAndPause, fadeVolumeTo } from "@/lib/mediaFade";

interface MusicAttributionProps {
  catalogueId: string;
  postId: string;
  /** True while the post is on screen (≥60% visible). Defaults to true outside lists. */
  active?: boolean;
  /** Opens the discovery sheet (wired in the Projects/Music step). */
  onOpenDiscovery?: (catalogueId: string) => void;
}

export function MusicAttribution({ catalogueId, postId, active = true, onOpenDiscovery }: MusicAttributionProps) {
  const { data: entry } = useMusicCatalogueEntry(catalogueId);
  const recordUsage = useRecordMusicUsageEvent();
  const player = useAudioPlayer(entry?.clip_url ?? null);
  const [muted, setMuted] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const hasRecordedPlayRef = useRef(false);
  const ducked = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!entry || !active || !appActive) return;

    const stop = () => fadeOutAndPause(player);
    try {
      player.loop = true;
      player.muted = muted;
    } catch {
      return;
    }

    announceMusicPlaying(stop);
    if (!ducked.current) {
      duckAudioBus();
      ducked.current = true;
    }
    fadeInAndPlay(player);
    if (!hasRecordedPlayRef.current) {
      hasRecordedPlayRef.current = true;
      recordUsage.mutate({ catalogueId: entry.id, eventType: "play", postId });
    }

    return () => {
      stop();
      if (ducked.current) {
        unduckAudioBus();
        ducked.current = false;
      }
      clearMusicPlaying(stop);
    };
    // `muted` is applied separately below so toggling it never restarts the clip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, entry?.clip_url, active, appActive, player]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    try {
      if (next) {
        fadeVolumeTo(player, 0);
        setTimeout(() => {
          try {
            player.muted = true;
          } catch {}
        }, 20);
      } else {
        player.muted = false;
        fadeVolumeTo(player, 1);
      }
    } catch {
      /* player released */
    }
  }

  if (!entry) return null;

  const featured = entry.contributors.filter((c) => c.role === "featured_artist");

  return (
    <View className="mt-2 min-w-0 flex-row items-center gap-2">
      <Pressable
        onPress={() => {
          recordUsage.mutate({ catalogueId: entry.id, eventType: "attribution_tap", postId });
          onOpenDiscovery?.(entry.id);
        }}
        accessibilityRole="button"
        className="min-w-0 flex-1 flex-row items-center gap-1.5"
      >
        <Icon as={Music2} size={14} className="shrink-0 text-ink-muted" />
        <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-ink-muted">
          <Text className="font-medium text-ink">{entry.title}</Text>
          {" · "}
          {entry.primary_artist_name}
          {featured.length > 0 ? ` · feat. ${featured.map((f) => f.contributor.display_name).join(", ")}` : ""}
        </Text>
      </Pressable>

      <Pressable onPress={toggleMute} hitSlop={10} accessibilityRole="button" accessibilityLabel={muted ? "Unmute" : "Mute"} className="shrink-0">
        <Icon as={muted ? VolumeX : Volume2} size={20} className="text-ink-muted" />
      </Pressable>
    </View>
  );
}
