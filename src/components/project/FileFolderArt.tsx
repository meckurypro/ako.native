// src/components/project/FileFolderArt.tsx
// The folder look for File projects (mirrors the web app's FileFolderArt):
//  - FileFolderIcon: the small 📂 tile used wherever a thumbnail would be (profile grid, mini cards, post embed,
//    pickers).
//  - FileFolderHero: the big version on a file's own card/page — a folder resting on two fanned-out sheets of
//    paper (where a book shows its upright cover), with the download count tucked underneath.
import { Download } from "lucide-react-native";
import { View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { FILE_FOLDER_EMOJI, formatDownloadCount } from "@/lib/fileProject";

/** Fixed `size` (px) or, without it, fills its parent (profile grid tiles, whatever size they are). */
export function FileFolderIcon({ size }: { size?: number }) {
  const glyph = size ?? 56;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center bg-accent-soft"
      style={size ? { width: size, height: size } : { width: "100%", height: "100%" }}
    >
      <Text style={{ fontSize: Math.round(glyph * 0.52), lineHeight: Math.round(glyph * 0.65) }}>{FILE_FOLDER_EMOJI}</Text>
    </View>
  );
}

export function FileFolderHero({ downloadCount }: { downloadCount?: number | null }) {
  return (
    <View className="h-full w-full items-center justify-center gap-3 bg-accent-soft" style={{ minHeight: 200 }}>
      <View className="h-28 w-28 items-center justify-center">
        {/* Fanned papers peeking out behind the folder */}
        <View
          className="absolute h-24 w-20 rounded-md border border-border bg-surface"
          style={{ transform: [{ translateX: -24 }, { rotate: "-12deg" }] }}
        />
        <View
          className="absolute h-24 w-20 rounded-md border border-border bg-surface"
          style={{ transform: [{ translateX: 20 }, { rotate: "6deg" }] }}
        />
        <Text style={{ fontSize: 84, lineHeight: 100 }}>{FILE_FOLDER_EMOJI}</Text>
      </View>
      {typeof downloadCount === "number" ? (
        <View className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1">
          <Icon as={Download} size={12} className="text-ink-muted" />
          <Text className="text-xs font-medium text-ink-muted">{formatDownloadCount(downloadCount)}</Text>
        </View>
      ) : null}
    </View>
  );
}
