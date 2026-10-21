// src/screens/OfflineViewer.tsx
// /projects/:id/offline — opens a project that was saved to this device as FILES (a hosted PDF/file, audio, video or
// image) straight from local storage, with no network. Books and courses saved as text open in their normal readers
// instead (see useOpenOfflineProject), so this screen never needs to know about them.
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Image as ExpoImage } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { useVideoPlayer, VideoView } from "expo-video";
import { ExternalLink, FileText, Pause, Play, RotateCcw, RotateCw } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineEntries } from "@/hooks/useOfflineProjects";
import { haptics } from "@/lib/haptics";
import { formatBytes } from "@/lib/offlineProjects";
import { offlineFileUri, removeOfflineProject, type OfflineEntry } from "@/lib/offlineStore";
import type { OfflineFileInfo } from "@/lib/offlineProjects";

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function AudioFile({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const pct = status.duration > 0 ? Math.min(100, (status.currentTime / status.duration) * 100) : 0;
  const skip = (by: number) => {
    try {
      void player.seekTo(Math.max(0, Math.min(status.duration || 0, status.currentTime + by)));
    } catch {
      /* player released */
    }
  };
  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface p-5">
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }} className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
        <View className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs text-ink-muted">{clock(status.currentTime)}</Text>
        <Text className="text-xs text-ink-muted">{clock(status.duration)}</Text>
      </View>
      <View className="flex-row items-center justify-center gap-8">
        <Pressable onPress={() => skip(-15)} accessibilityRole="button" accessibilityLabel="Back 15 seconds" hitSlop={10}>
          <Icon as={RotateCcw} size={26} className="text-ink-muted" />
        </Pressable>
        <Pressable
          onPress={() => (status.playing ? player.pause() : player.play())}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pause" : "Play"}
          className="h-16 w-16 items-center justify-center rounded-full bg-accent"
        >
          <Icon as={status.playing ? Pause : Play} size={28} className="text-canvas" />
        </Pressable>
        <Pressable onPress={() => skip(15)} accessibilityRole="button" accessibilityLabel="Forward 15 seconds" hitSlop={10}>
          <Icon as={RotateCw} size={26} className="text-ink-muted" />
        </Pressable>
      </View>
    </View>
  );
}

function VideoFile({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return (
    <View className="overflow-hidden rounded-3xl bg-black">
      <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", aspectRatio: 16 / 9 }} />
    </View>
  );
}

function OpenFileCard({ file, uri, title }: { file: OfflineFileInfo; uri: string; title: string }) {
  const toast = useToast();
  async function open() {
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error("sharing_unavailable");
      // The system "Open with…" sheet — the same way chat documents open.
      await Sharing.shareAsync(uri, { mimeType: file.mime ?? undefined, dialogTitle: title });
    } catch {
      toast("Couldn't open this file on this device.", { variant: "error" });
    }
  }
  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface p-5">
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-canvas">
          <Icon as={FileText} size={24} className="text-ink-muted" />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={2} className="text-sm font-medium text-ink">
            {file.name}
          </Text>
          <Text className="text-xs text-ink-muted">{formatBytes(file.bytes)}</Text>
        </View>
      </View>
      <Button onPress={() => void open()}>
        <View className="flex-row items-center gap-2">
          <Icon as={ExternalLink} size={18} className="text-canvas" />
          <Text className="text-base text-canvas">Open</Text>
        </View>
      </Button>
    </View>
  );
}

function Missing({ message, onRemove }: { message: string; onRemove?: () => void }) {
  return (
    <View className="items-center gap-4 px-6 py-10">
      <Text className="text-center text-ink">{message}</Text>
      {onRemove ? (
        <Button size="sm" variant="secondary" onPress={onRemove}>
          Remove download
        </Button>
      ) : null}
    </View>
  );
}

export function OfflineViewer() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const entries = useOfflineEntries();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const entry: OfflineEntry | undefined = useMemo(() => entries.data?.find((e) => e.projectId === projectId), [entries.data, projectId]);
  const files = useMemo(() => (entry ? entry.files.map((f) => ({ file: f, uri: offlineFileUri(entry, f) })) : []), [entry]);
  const incomplete = files.some((f) => !f.uri);

  async function remove() {
    setConfirmRemove(false);
    if (!user || !projectId) return;
    await removeOfflineProject(user.id, projectId);
    haptics.light();
    toast("Download removed");
    router.back();
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={entry?.title ?? "Download"} />
      {entries.isLoading ? (
        <View className="items-center py-10">
          <ActivityIndicator />
        </View>
      ) : !entry ? (
        <Missing message="This download isn't on this device." />
      ) : incomplete ? (
        // The OS can purge app storage under pressure; say so plainly rather than show a broken player.
        <Missing message="Part of this download is missing from your device. Remove it, then download it again." onRemove={() => setConfirmRemove(true)} />
      ) : (
        <ScrollView showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 16 }} showsVerticalScrollIndicator={false}>
          {files.map(({ file, uri }) => {
            if (!uri) return null;
            switch (file.kind) {
              case "audio":
                return <AudioFile key={file.name} uri={uri} />;
              case "video":
                return <VideoFile key={file.name} uri={uri} />;
              case "image":
                return <ExpoImage key={file.name} source={{ uri }} contentFit="contain" accessibilityLabel={entry.title} style={{ width: "100%", aspectRatio: 1 }} />;
              default:
                return <OpenFileCard key={file.name} file={file} uri={uri} title={entry.title} />;
            }
          })}
          <Button variant="ghost" onPress={() => setConfirmRemove(true)}>
            Remove download · {formatBytes(entry.bytes)}
          </Button>
        </ScrollView>
      )}
      {confirmRemove ? (
        <ConfirmDialog
          title="Remove this download?"
          description="It will be removed from this device. It stays in your library, and you can download it again anytime."
          confirmLabel="Remove"
          danger={false}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </View>
  );
}
