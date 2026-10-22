// src/components/project/FileFolderArt.tsx
// The folder look for File projects (mirrors the web app's FileFolderArt):
//  - FileFolderIcon: the small 📂 tile used wherever a thumbnail would be (profile grid, mini cards, post embed,
//    pickers).
//  - FileFolderHero: the big version on a file's own card/page — a folder resting on two fanned-out sheets of
//    paper (where a book shows its upright cover), with the download count tucked underneath.
// Both sit on the same diagonal wash as web (accent → surface); react-native-svg draws it, so no extra native module.
import { Download } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { FILE_FOLDER_EMOJI, formatDownloadCount } from "@/lib/fileProject";
import { useTheme } from "@/theme/ThemeProvider";

/** Top-left → bottom-right wash, like web's bg-gradient-to-br. Fills its parent; draws behind everything else. */
function FolderWash({ id, stops }: { id: string; stops: { offset: number; color: string; opacity: number }[] }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {stops.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Fixed `size` (px) or, without it, fills its parent (profile grid tiles, whatever size they are). */
export function FileFolderIcon({ size }: { size?: number }) {
  const { colors } = useTheme();
  const glyph = size ?? 56;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center overflow-hidden bg-surface"
      style={size ? { width: size, height: size } : { width: "100%", height: "100%" }}
    >
      <FolderWash
        id="fileIconWash"
        stops={[
          { offset: 0, color: colors.accent, opacity: 0.15 },
          { offset: 1, color: colors.surface, opacity: 1 },
        ]}
      />
      <Text style={{ fontSize: Math.round(glyph * 0.52), lineHeight: Math.round(glyph * 0.65) }}>{FILE_FOLDER_EMOJI}</Text>
    </View>
  );
}

export function FileFolderHero({ downloadCount }: { downloadCount?: number | null }) {
  const { colors } = useTheme();
  const ink = `rgba(${colors.shadowInkRgb}, `;
  const paperShadow = { shadowColor: `rgb(${colors.shadowInkRgb})`, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 };
  return (
    <View className="h-full w-full items-center justify-center gap-3 overflow-hidden bg-canvas" style={{ minHeight: 200 }}>
      <FolderWash
        id="fileHeroWash"
        stops={[
          { offset: 0, color: colors.accent, opacity: 0.1 },
          { offset: 0.5, color: colors.canvas, opacity: 1 },
          { offset: 1, color: colors.surface, opacity: 1 },
        ]}
      />
      <View className="h-28 w-28 items-center justify-center">
        {/* Fanned papers peeking out behind the folder */}
        <View
          className="absolute h-24 w-20 rounded-md border border-border-a60 bg-surface"
          style={[{ transform: [{ translateX: -24 }, { rotate: "-12deg" }] }, paperShadow]}
        />
        <View
          className="absolute h-24 w-20 rounded-md border border-border-a60 bg-surface"
          style={[{ transform: [{ translateX: 20 }, { rotate: "6deg" }] }, paperShadow]}
        />
        <Text
          style={{
            fontSize: 84,
            lineHeight: 100,
            textShadowColor: `${ink}0.25)`,
            textShadowOffset: { width: 0, height: 6 },
            textShadowRadius: 10,
          }}
        >
          {FILE_FOLDER_EMOJI}
        </Text>
      </View>
      {typeof downloadCount === "number" ? (
        <View className="flex-row items-center gap-1.5 rounded-full border border-border-a60 bg-surface-a80 px-3 py-1">
          <Icon as={Download} size={12} className="text-ink-muted" />
          <Text className="text-xs font-medium text-ink-muted">{formatDownloadCount(downloadCount)}</Text>
        </View>
      ) : null}
    </View>
  );
}
