// src/components/messages/MediaMessage.tsx
// Photos, albums and documents inside a chat bubble, laid out like WhatsApp:
//  • one photo → edge-to-edge with the time + ticks on a dark pill in the corner
//  • 2–4+ photos → a grid (the 4th tile shows "+N" for anything beyond four)
//  • a caption sits under the media, with the time at its end like a text message
//  • documents → coloured type tile, file name, "PDF · 1.2 MB", download button
// Media you RECEIVE isn't pulled down until you tap it (WhatsApp): the tile shows a "↓ size" button, the tap
// downloads it with a progress ring (✕ to cancel) into the device's storage, and from then on it opens locally.
// Tapping a downloaded photo opens the full-screen viewer; tapping a document downloads (once) + opens it.
import { Image } from "expo-image";
import { ArrowDown, Check, FileText, ImageIcon, ImageOff, RotateCw } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View, useWindowDimensions } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useMediaUrl } from "@/hooks/useMediaUrl";
import { albumLayout, documentStyle, formatFileSize, type MediaItem, type MediaPayload } from "@/lib/chatMedia";
import { downloadChatMedia, useChatMediaDownload } from "@/lib/chatMediaStore";
import { openChatFile } from "@/lib/downloadChatFile";
import { DownloadPill, ProgressRing } from "./DownloadControl";
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

function Tile({
  item,
  width,
  height,
  overlay,
  onPress,
  isMine,
  album,
}: {
  item: MediaItem;
  width: number;
  height: number;
  overlay?: ReactNode;
  onPress: () => void;
  isMine: boolean;
  /** Every item in this message — one tap downloads the whole album, like WhatsApp. */
  album: MediaItem[];
}) {
  const dl = useChatMediaDownload(item);
  // Photos you received stay as a placeholder until you tap to download them; your own are shown straight away.
  const gated = !isMine && !!item.path && !dl.localUri;
  const { url, failed, uploading } = useMediaUrl(item, { enabled: !gated });
  const downloading = dl.status === "downloading";

  function handlePress() {
    if (!gated) {
      onPress();
      return;
    }
    if (downloading) return; // the ring owns cancel
    for (const it of album) if (it.path) void downloadChatMedia(it).catch(() => {});
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="imagebutton"
      accessibilityLabel={gated ? `Download photo ${item.name}` : `Photo ${item.name}`}
      style={{ width, height }}
      className="overflow-hidden bg-ink-muted-a15"
    >
      {gated ? (
        <View className="flex-1 items-center justify-center">
          <Icon as={ImageIcon} size={Math.min(48, Math.round(width / 3))} className="text-ink-muted-a40" />
        </View>
      ) : failed ? (
        <View className="flex-1 items-center justify-center gap-1">
          <Icon as={ImageOff} size={22} className="text-ink-muted" />
          <Text className="text-[11px] text-ink-muted">Photo unavailable</Text>
        </View>
      ) : url ? (
        <Image source={{ uri: url, cacheKey: item.path ? `chat-media/${item.path}` : undefined }} contentFit="cover" style={{ width, height }} transition={150} cachePolicy="memory-disk" recyclingKey={item.path ?? item.url} />
      ) : null}
      {gated ? (
        <View pointerEvents="box-none" className="absolute inset-0 items-center justify-center">
          {downloading ? (
            <ProgressRing progress={dl.progress} onCancel={dl.cancel} />
          ) : (
            <DownloadPill label={formatFileSize(item.size)} failed={dl.status === "failed"} onPress={handlePress} />
          )}
        </View>
      ) : null}
      {uploading ? (
        <View className="absolute inset-0 items-center justify-center bg-black-a25">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-black-a50">
            <ActivityIndicator color="#FFFFFF" />
          </View>
        </View>
      ) : null}
      {overlay}
    </Pressable>
  );
}

function PhotoGrid({ items, width, onOpen, isMine }: { items: MediaItem[]; width: number; onOpen: (i: number) => void; isMine: boolean }) {
  const { shown, extra } = albumLayout(items.length);
  const half = (width - GAP) / 2;
  const more = (i: number) =>
    extra > 0 && i === shown - 1 ? (
      <View className="absolute inset-0 items-center justify-center bg-black-a50">
        <Text className="text-2xl font-semibold text-white">+{extra + 1}</Text>
      </View>
    ) : undefined;

  if (items.length === 1) {
    const it = items[0];
    const ratio = it.width && it.height ? Math.min(1.4, Math.max(0.75, it.width / it.height)) : 1;
    return <Tile isMine={isMine} album={items} item={it} width={width} height={Math.round(width / ratio)} onPress={() => onOpen(0)} />;
  }
  if (shown === 2) {
    const h = Math.round(width * 0.62);
    return (
      <View className="flex-row" style={{ gap: GAP }}>
        <Tile isMine={isMine} album={items} item={items[0]} width={half} height={h} onPress={() => onOpen(0)} />
        <Tile isMine={isMine} album={items} item={items[1]} width={half} height={h} onPress={() => onOpen(1)} />
      </View>
    );
  }
  if (shown === 3) {
    const total = width;
    const small = (total - GAP) / 2;
    return (
      <View className="flex-row" style={{ gap: GAP }}>
        <Tile isMine={isMine} album={items} item={items[0]} width={half} height={total} onPress={() => onOpen(0)} />
        <View style={{ gap: GAP }}>
          <Tile isMine={isMine} album={items} item={items[1]} width={half} height={small} onPress={() => onOpen(1)} />
          <Tile isMine={isMine} album={items} item={items[2]} width={half} height={small} onPress={() => onOpen(2)} />
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: GAP }}>
      <View className="flex-row" style={{ gap: GAP }}>
        <Tile isMine={isMine} album={items} item={items[0]} width={half} height={half} onPress={() => onOpen(0)} />
        <Tile isMine={isMine} album={items} item={items[1]} width={half} height={half} onPress={() => onOpen(1)} />
      </View>
      <View className="flex-row" style={{ gap: GAP }}>
        <Tile isMine={isMine} album={items} item={items[2]} width={half} height={half} onPress={() => onOpen(2)} />
        <Tile isMine={isMine} album={items} item={items[3]} width={half} height={half} overlay={more(3)} onPress={() => onOpen(3)} />
      </View>
    </View>
  );
}

function DocumentCard({ item, isMine }: { item: MediaItem; isMine: boolean }) {
  const toast = useToast();
  const dl = useChatMediaDownload(item);
  const [sharing, setSharing] = useState(false);
  const style = documentStyle(item.name, item.mime);
  const uploading = !item.path;
  const downloading = dl.status === "downloading";
  const onDevice = !!dl.localUri;

  // Tap: download once (progress ring, ✕ to cancel), keep it on the device, then open it. Later taps open instantly.
  async function open() {
    if (sharing || uploading || downloading) return;
    setSharing(true);
    try {
      await openChatFile(item);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) toast("Couldn't open that file.", { variant: "error" });
    } finally {
      setSharing(false);
    }
  }

  const sub = [style.label, formatFileSize(item.size)].filter(Boolean).join(" · ");

  return (
    <Pressable
      onPress={() => void open()}
      accessibilityRole="button"
      accessibilityLabel={`${onDevice ? "Open" : "Download"} document ${item.name}`}
      className={`min-w-[220px] flex-row items-center gap-3 rounded-xl p-2 ${isMine ? "bg-black-a10" : "bg-ink-muted-a10"}`}
    >
      <View className="h-11 w-11 items-center justify-center rounded-lg" style={{ backgroundColor: style.color }}>
        <Icon as={FileText} size={20} color="#FFFFFF" />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} className={`text-sm font-medium ${isMine ? "text-white" : "text-ink"}`}>
          {item.name}
        </Text>
        <Text className={`text-[11px] ${isMine ? "text-white-a70" : "text-ink-muted"}`}>{sub}</Text>
      </View>
      {downloading ? (
        <ProgressRing progress={dl.progress} size={36} dark={false} onCancel={dl.cancel} />
      ) : (
        <View className={`h-9 w-9 items-center justify-center rounded-full ${isMine ? "bg-white-a20" : "bg-ink-muted-a15"}`}>
          {sharing || uploading ? (
            <ActivityIndicator size="small" color={isMine ? "#FFFFFF" : undefined} />
          ) : dl.status === "failed" ? (
            <Icon as={RotateCw} size={17} className={isMine ? "text-white" : "text-ink"} />
          ) : onDevice ? (
            <Icon as={Check} size={18} className={isMine ? "text-white" : "text-ink"} />
          ) : (
            <Icon as={ArrowDown} size={18} className={isMine ? "text-white" : "text-ink"} />
          )}
        </View>
      )}
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
        <PhotoGrid items={media.items} width={gridWidth} onOpen={setViewerIndex} isMine={isMine} />
        {!media.caption ? (
          <View pointerEvents="none" className="absolute bottom-1.5 right-1.5 flex-row items-center gap-1 rounded-full bg-black-a45 px-2 py-0.5">
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
