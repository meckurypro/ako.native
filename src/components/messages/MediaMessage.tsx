// src/components/messages/MediaMessage.tsx
// Photos, albums and documents inside a chat bubble, laid out like WhatsApp:
//  • one photo → edge-to-edge with the time + ticks on a dark pill in the corner
//  • 2–4+ photos → a grid (the 4th tile shows "+N" for anything beyond four)
//  • a caption sits under the media, with the time at its end like a text message
//  • documents → coloured type tile, file name, "PDF · 1.2 MB", download button
// Tapping a photo opens the full-screen viewer; tapping a document downloads + opens it.
import { Image } from "expo-image";
import { ArrowDown, FileText, ImageOff } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View, useWindowDimensions } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useMediaUrl } from "@/hooks/useMediaUrl";
import { albumLayout, documentStyle, formatFileSize, type MediaItem, type MediaPayload } from "@/lib/chatMedia";
import { openChatFile } from "@/lib/downloadChatFile";
import { ImageViewer } from "./ImageViewer";

interface MediaMessageProps {
  media: MediaPayload;
  isMine: boolean;
  timeStr: string;
  ticks: ReactNode;
  senderName: string;
  /** Pre-formatted "Today, 14:05"-style label for the viewer's top bar. */
  sentLabel: string;
  footerColor: string;
  textColor: string;
}

const GAP = 2;

function Tile({ item, width, height, overlay, onPress }: { item: MediaItem; width: number; height: number; overlay?: ReactNode; onPress: () => void }) {
  const { url, failed, uploading } = useMediaUrl(item);
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${item.name}`} style={{ width, height }} className="overflow-hidden bg-ink-muted/15">
      {failed ? (
        <View className="flex-1 items-center justify-center gap-1">
          <Icon as={ImageOff} size={22} className="text-ink-muted" />
          <Text className="text-[11px] text-ink-muted">Photo unavailable</Text>
        </View>
      ) : url ? (
        <Image source={{ uri: url }} contentFit="cover" style={{ width, height }} transition={150} cachePolicy="disk" recyclingKey={item.path ?? item.url} />
      ) : null}
      {uploading ? (
        <View className="absolute inset-0 items-center justify-center bg-black/25">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-black/50">
            <ActivityIndicator color="#FFFFFF" />
          </View>
        </View>
      ) : null}
      {overlay}
    </Pressable>
  );
}

function PhotoGrid({ items, width, onOpen }: { items: MediaItem[]; width: number; onOpen: (i: number) => void }) {
  const { shown, extra } = albumLayout(items.length);
  const half = (width - GAP) / 2;
  const more = (i: number) =>
    extra > 0 && i === shown - 1 ? (
      <View className="absolute inset-0 items-center justify-center bg-black/50">
        <Text className="text-2xl font-semibold text-white">+{extra + 1}</Text>
      </View>
    ) : undefined;

  if (items.length === 1) {
    const it = items[0];
    const ratio = it.width && it.height ? Math.min(1.4, Math.max(0.75, it.width / it.height)) : 1;
    return <Tile item={it} width={width} height={Math.round(width / ratio)} onPress={() => onOpen(0)} />;
  }
  if (shown === 2) {
    const h = Math.round(width * 0.62);
    return (
      <View className="flex-row" style={{ gap: GAP }}>
        <Tile item={items[0]} width={half} height={h} onPress={() => onOpen(0)} />
        <Tile item={items[1]} width={half} height={h} onPress={() => onOpen(1)} />
      </View>
    );
  }
  if (shown === 3) {
    const total = width;
    const small = (total - GAP) / 2;
    return (
      <View className="flex-row" style={{ gap: GAP }}>
        <Tile item={items[0]} width={half} height={total} onPress={() => onOpen(0)} />
        <View style={{ gap: GAP }}>
          <Tile item={items[1]} width={half} height={small} onPress={() => onOpen(1)} />
          <Tile item={items[2]} width={half} height={small} onPress={() => onOpen(2)} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: GAP }}>
      <View className="flex-row" style={{ gap: GAP }}>
        <Tile item={items[0]} width={half} height={half} onPress={() => onOpen(0)} />
        <Tile item={items[1]} width={half} height={half} onPress={() => onOpen(1)} />
      </View>
      <View className="flex-row" style={{ gap: GAP }}>
        <Tile item={items[2]} width={half} height={half} onPress={() => onOpen(2)} />
        <Tile item={items[3]} width={half} height={half} overlay={more(3)} onPress={() => onOpen(3)} />
      </View>
    </View>
  );
}

function DocumentCard({ item, isMine }: { item: MediaItem; isMine: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const style = documentStyle(item.name, item.mime);
  const uploading = !item.path;

  async function open() {
    if (busy || uploading) return;
    setBusy(true);
    try {
      await openChatFile(item);
    } catch {
      toast("Couldn't open that file.", { variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={() => void open()}
      accessibilityRole="button"
      accessibilityLabel={`Document ${item.name}`}
      className={`min-w-[220px] flex-row items-center gap-3 rounded-xl p-2 ${isMine ? "bg-black/10" : "bg-ink-muted/10"}`}
    >
      <View className="h-11 w-11 items-center justify-center rounded-lg" style={{ backgroundColor: style.color }}>
        <Icon as={FileText} size={20} color="#FFFFFF" />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} className={`text-sm font-medium ${isMine ? "text-white" : "text-ink"}`}>
          {item.name}
        </Text>
        <Text className={`text-[11px] ${isMine ? "text-white/70" : "text-ink-muted"}`}>{[style.label, formatFileSize(item.size)].filter(Boolean).join(" · ")}</Text>
      </View>
      <View className={`h-9 w-9 items-center justify-center rounded-full ${isMine ? "bg-white/20" : "bg-ink-muted/15"}`}>
        {busy || uploading ? <ActivityIndicator size="small" color={isMine ? "#FFFFFF" : undefined} /> : <Icon as={ArrowDown} size={18} className={isMine ? "text-white" : "text-ink"} />}
      </View>
    </Pressable>
  );
}

export function MediaMessage({ media, isMine, timeStr, ticks, senderName, sentLabel, footerColor, textColor }: MediaMessageProps) {
  const { width: screenW } = useWindowDimensions();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const first = media.items[0];
  const gridWidth = Math.round(Math.min(264, screenW * 0.66));

  const timeFooter = (
    <View className="flex-row items-center justify-end gap-1">
      <Text className={`text-[11px] ${footerColor}`}>{timeStr}</Text>
      {ticks}
    </View>
  );

  if (first.kind === "document") {
    return (
      <View>
        <DocumentCard item={first} isMine={isMine} />
        {media.caption ? <Text className={`mt-1.5 text-sm leading-[20px] ${textColor}`}>{media.caption}</Text> : null}
        <View className="mt-1">{timeFooter}</View>
      </View>
    );
  }

  return (
    <View>
      <View className="overflow-hidden rounded-xl">
        <PhotoGrid items={media.items} width={gridWidth} onOpen={setViewerIndex} />
        {!media.caption ? (
          <View pointerEvents="none" className="absolute bottom-1.5 right-1.5 flex-row items-center gap-1 rounded-full bg-black/45 px-2 py-0.5">
            <Text className="text-[11px] text-white">{timeStr}</Text>
            {ticks}
          </View>
        ) : null}
      </View>
      {media.caption ? (
        <View className="px-1.5 pb-0.5 pt-1.5" style={{ width: gridWidth }}>
          <Text className={`text-sm leading-[20px] ${textColor}`}>{media.caption}</Text>
          <View className="mt-0.5">{timeFooter}</View>
        </View>
      ) : null}
      {viewerIndex !== null ? (
        <ImageViewer
          items={media.items}
          initialIndex={viewerIndex}
          title={isMine ? "You" : senderName}
          subtitle={sentLabel}
          caption={media.caption}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </View>
  );
}
