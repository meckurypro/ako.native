// src/components/music/AddMusicSheet.tsx
//
// Composer's "♫ Add music" control. Port of the web AddMusicSheet: searches the existing Akọ
// catalogue — deliberately not a full streaming application: search, artwork, title, artist,
// featured artists, preview, select. Uses the catalogue's existing clip rather than creating
// another clip-selection system here.
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Music as MusicIcon, Pause, Play, Search } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useMusicCatalogueSearch } from "@/hooks/useMusicCatalogue";
import { useTheme } from "@/theme/ThemeProvider";
import type { MusicSearchResult } from "@/types/music";

interface AddMusicSheetProps {
  onSelect: (song: MusicSearchResult) => void;
  onClose: () => void;
}

export function AddMusicSheet({ onSelect, onClose }: AddMusicSheetProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { data: results, isLoading } = useMusicCatalogueSearch(query);

  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  // Preview ran to the end → reset the button (web: audio.onended).
  useEffect(() => {
    if (status.didJustFinish) setPlayingId(null);
  }, [status.didJustFinish]);

  // Closing the sheet must stop the preview.
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // player already released
      }
    };
  }, [player]);

  function togglePreview(song: MusicSearchResult) {
    if (playingId === song.id) {
      player.pause();
      setPlayingId(null);
      return;
    }
    player.replace(song.clip_url);
    player.play();
    setPlayingId(song.id);
  }

  const list = results ?? [];

  return (
    <SheetFrame title="Add music" onClose={onClose} zIndex={60} avoidKeyboard heightRatio={0.85} bodyScroll={false}>
      <View className="shrink-0 px-4 pt-3">
        <View className="relative justify-center">
          <View pointerEvents="none" className="absolute left-3.5 z-10">
            <Icon as={Search} size={16} className="text-ink-muted" />
          </View>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search songs or artists…"
            placeholderTextColor={colors.inkMuted}
            selectionColor={colors.accent}
            returnKeyType="search"
            className="rounded-full border border-border bg-canvas py-2.5 pl-10 pr-3 text-sm text-ink"
          />
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerClassName="px-4 py-3">
        {isLoading ? <Text className="py-8 text-center text-sm text-ink-muted">Searching…</Text> : null}
        {!isLoading && list.length === 0 ? (
          <Text className="py-8 text-center text-sm text-ink-muted">
            {query.trim() ? "No songs match that search." : "No music in the catalogue yet."}
          </Text>
        ) : null}

        <View className="gap-1">
          {list.map((song) => {
            const playing = playingId === song.id;
            return (
              <View key={song.id} className="flex-row items-center gap-3 rounded-xl px-1 py-2">
                <Pressable
                  onPress={() => togglePreview(song)}
                  accessibilityRole="button"
                  accessibilityLabel={playing ? "Pause preview" : "Preview"}
                  className="relative h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft"
                >
                  {song.cover_url ? (
                    <>
                      <Image source={song.cover_url} contentFit="cover" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
                      <View className="absolute inset-0 items-center justify-center bg-canvas-a40">
                        <Icon as={playing ? Pause : Play} size={13} className="text-canvas" />
                      </View>
                    </>
                  ) : (
                    <Icon as={playing ? Pause : MusicIcon} size={14} className="text-accent" />
                  )}
                </Pressable>

                <Pressable onPress={() => onSelect(song)} accessibilityRole="button" className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm font-medium text-ink">
                    {song.title}
                  </Text>
                  <Text numberOfLines={1} className="text-xs text-ink-muted">
                    {song.primary_artist_name}
                    {song.featured_artist_names.length > 0 ? ` · feat. ${song.featured_artist_names.join(", ")}` : ""}
                  </Text>
                </Pressable>

                <Pressable onPress={() => onSelect(song)} accessibilityRole="button" className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5">
                  <Text className="text-xs font-medium text-accent">Use</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SheetFrame>
  );
}
