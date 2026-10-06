// src/components/project/EventHighlightsSection.tsx
// "From the event": photos, video and audio the host uploads after it's happened.
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image as ImageIcon, Music, Pause, Play, Trash2, Music as MusicIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Sheet } from "@/components/ui/Sheet";
import { SheetCancel, SheetRow } from "@/components/ui/SheetParts";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAddEventHighlight, useDeleteEventHighlight, useEventHighlights, type EventHighlight } from "@/hooks/useEventHighlights";
import { fromDocumentPickerAsset, fromImagePickerAsset } from "@/lib/localFile";

function AudioHighlight({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  return (
    <View className="flex-row items-center gap-2 p-3">
      <Icon as={Music} size={16} className="shrink-0 text-ink-muted" />
      <Pressable
        onPress={() => (status.playing ? player.pause() : player.play())}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? "Pause" : "Play"}
        className="h-9 w-9 items-center justify-center rounded-full bg-accent"
      >
        <Icon as={status.playing ? Pause : Play} size={14} fill="#F7F4EF" className="text-canvas" />
      </Pressable>
      <View className="h-1 flex-1 overflow-hidden rounded-full bg-border">
        <View className="h-full bg-accent" style={{ width: `${status.duration > 0 ? (status.currentTime / status.duration) * 100 : 0}%` }} />
      </View>
    </View>
  );
}

function VideoHighlight({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return <VideoView player={player} nativeControls contentFit="cover" style={{ width: "100%", aspectRatio: 1 }} />;
}

function HighlightTile({ highlight, isOwner, onDelete, deletePending }: { highlight: EventHighlight; isOwner: boolean; onDelete: () => void; deletePending: boolean }) {
  return (
    <View className="relative overflow-hidden rounded-xl border border-border bg-canvas" style={{ width: "48.5%" }}>
      {highlight.media_type === "photo" ? (
        <Image source={{ uri: highlight.file_url }} contentFit="cover" accessibilityLabel={highlight.caption ?? ""} style={{ width: "100%", aspectRatio: 1 }} />
      ) : null}
      {highlight.media_type === "video" ? <VideoHighlight url={highlight.file_url} /> : null}
      {highlight.media_type === "audio" ? <AudioHighlight url={highlight.file_url} /> : null}
      {highlight.caption ? (
        <Text numberOfLines={1} className="px-2 py-1.5 text-xs text-ink-muted">
          {highlight.caption}
        </Text>
      ) : null}
      {isOwner ? (
        <Pressable
          onPress={onDelete}
          disabled={deletePending}
          accessibilityRole="button"
          accessibilityLabel="Remove highlight"
          className={`absolute right-1.5 top-1.5 rounded-full bg-canvas/80 p-1.5 ${deletePending ? "opacity-50" : ""}`}
        >
          <Icon as={Trash2} size={13} className="text-danger" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function EventHighlightsSection({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const { data: highlights } = useEventHighlights(projectId);
  const addHighlight = useAddEventHighlight(projectId);
  const deleteHighlight = useDeleteEventHighlight(projectId);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload(getFile: () => Promise<ReturnType<typeof fromImagePickerAsset> | null>) {
    setUploadError(null);
    try {
      const file = await getFile();
      if (file) await addHighlight.mutateAsync({ file });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't upload that file.");
    }
  }

  const pickPhotoOrVideo = () =>
    upload(async () => {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 1 });
      return r.canceled ? null : fromImagePickerAsset(r.assets[0]);
    });
  const pickAudio = () =>
    upload(async () => {
      const r = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
      return r.canceled ? null : fromDocumentPickerAsset(r.assets[0]);
    });

  if (!highlights || (highlights.length === 0 && !isOwner)) return null;

  return (
    <View className="mt-6">
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Icon as={Play} size={15} className="text-ink" />
          <Text className="font-display text-lg font-semibold tracking-tight text-ink">From the event</Text>
        </View>
        {isOwner ? (
          <Pressable onPress={() => setChooserOpen(true)} disabled={addHighlight.isPending} accessibilityRole="button" className={addHighlight.isPending ? "opacity-50" : ""}>
            <Text className="text-sm font-medium text-accent">{addHighlight.isPending ? "Uploading…" : "Add"}</Text>
          </Pressable>
        ) : null}
      </View>

      {uploadError ? <Text className="mb-2 text-xs text-danger">{uploadError}</Text> : null}

      {highlights.length === 0 ? (
        <Text className="text-sm text-ink-muted">Upload photos, video, or audio from the event once it's happened — it stays here for anyone to see.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {highlights.map((h) => (
            <HighlightTile key={h.id} highlight={h} isOwner={isOwner} onDelete={() => deleteHighlight.mutate(h.id)} deletePending={deleteHighlight.isPending} />
          ))}
        </View>
      )}

      {chooserOpen ? (
        <Sheet onClose={() => setChooserOpen(false)} accessibilityLabel="Add a highlight">
          <SheetRow label="Photo or video" icon={<Icon as={ImageIcon} size={18} className="text-ink" />} onPress={() => void pickPhotoOrVideo()} />
          <SheetRow label="Audio file" icon={<Icon as={MusicIcon} size={18} className="text-ink" />} onPress={() => void pickAudio()} />
          <SheetCancel />
        </Sheet>
      ) : null}
    </View>
  );
}
