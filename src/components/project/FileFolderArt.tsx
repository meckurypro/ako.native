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

/**
 * Mirrors web's FileFolderIcon({ size, className }): `size` is the tile size the glyph is scaled to (emoji = size × 0.52),
 * exactly like web, so a folder looks the same weight at every size. By default the tile is that fixed size; with `fill`
 * it stretches to its parent instead (web's `className="w-full h-full"`) while the glyph keeps scaling from `size`.
 */
export function FileFolderIcon({ size = 64, fill = false }: { size?: number; fill?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center overflow-hidden bg-surface"
      style={fill ? { width: "100%", height: "100%" } : { width: size, height: size }}
    >
      <FolderWash
        id="fileIconWash"
        stops={[
          { offset: 0, color: colors.accent, opacity: 0.15 },
          { offset: 1, color: colors.surface, opacity: 1 },
        ]}
      />
      <Text style={{ fontSize: Math.round(size * 0.52), lineHeight: Math.round(size * 0.65) }}>{FILE_FOLDER_EMOJI}</Text>
    </View>
  );
}

/**
 * `fill` — the hero sits in a box with a definite size (a ProjectCard's aspect-ratio thumbnail frame) and stretches to it.
 * Without it (Create / Edit screens, where web wraps it in an auto-height box with min-h-[200px]) it sizes itself:
 * percentage heights under an auto-height parent are what made the Edit screen's hero grow to the whole scroll height.
 */
export function FileFolderHero({ downloadCount, fill = false }: { downloadCount?: number | null; fill?: boolean }) {
  const { colors } = useTheme();
  const ink = `rgba(${colors.shadowInkRgb}, `;
  const paperShadow = { shadowColor: `rgb(${colors.shadowInkRgb})`, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 };
  return (
    <View className={`${fill ? "h-full " : ""}w-full items-center justify-center gap-3 overflow-hidden bg-canvas`} style={{ minHeight: 200 }}>
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
