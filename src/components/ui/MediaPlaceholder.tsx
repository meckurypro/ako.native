// src/components/ui/MediaPlaceholder.tsx
// Stand-in for media that is missing or failed to load (e.g. a file that exists in the other Supabase project's
// storage only): a deterministic gradient with a kind-specific icon. Scales with whatever box it is put in.
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

export type MediaKind = "image" | "video" | "audio" | "avatar";

const GRADIENTS: [string, string][] = [
  ["#f97316", "#ec4899"],
  ["#6366f1", "#06b6d4"],
  ["#10b981", "#3b82f6"],
  ["#f59e0b", "#ef4444"],
  ["#8b5cf6", "#ec4899"],
  ["#14b8a6", "#6366f1"],
  ["#f43f5e", "#f59e0b"],
  ["#0ea5e9", "#8b5cf6"],
];

export function gradientFor(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

// lucide icon geometry (24x24)
const ICONS: Record<MediaKind, ReactNode> = {
  image: (
    <>
      <Rect width={18} height={18} x={3} y={3} rx={2} ry={2} />
      <Circle cx={9} cy={9} r={2} />
      <Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>
  ),
  video: (
    <>
      <Path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <Rect x={2} y={6} width={14} height={12} rx={2} />
    </>
  ),
  audio: (
    <>
      <Path d="M9 18V5l12-2v13" />
      <Circle cx={6} cy={18} r={3} />
      <Circle cx={18} cy={16} r={3} />
    </>
  ),
  avatar: (
    <>
      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <Circle cx={12} cy={7} r={4} />
    </>
  ),
};

export function MediaPlaceholder({
  kind = "image",
  seed = "",
  style,
  label,
}: {
  kind?: MediaKind;
  seed?: string;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const [a, b] = gradientFor(seed);
  const id = `mp-${kind}`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ?? `${kind} unavailable`}
      style={[{ overflow: "hidden" }, style]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </LinearGradient>
        </Defs>
        <Rect width={400} height={400} fill={`url(#${id})`} />
        <G
          transform="translate(160 160) scale(3.33)"
          fill="none"
          stroke="#fff"
          strokeOpacity={0.85}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ICONS[kind]}
        </G>
      </Svg>
    </View>
  );
}
