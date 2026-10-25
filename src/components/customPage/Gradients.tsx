// src/components/customPage/Gradients.tsx
// Gradient layers for Custom Pages. The app has no linear-gradient dependency, so these are react-native-svg fills.
import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

/** Dark scrim that fades up from the bottom edge — keeps a hero's title readable over any photo. */
export function BottomScrim() {
  const id = useId().replace(/:/g, "");
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor="#000" stopOpacity={0.62} />
            <Stop offset="0.62" stopColor="#000" stopOpacity={0.08} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.08} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The Glass style's backdrop: the primary colour with two soft accent glows, like the web page. */
export function GlassBackdrop({ primary, accent }: { primary: string; accent: string }) {
  const a = useId().replace(/:/g, "");
  const b = useId().replace(/:/g, "");
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: primary }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={a} cx="0.12" cy="0" r="0.8">
            <Stop offset="0" stopColor={accent} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={b} cx="1" cy="1" r="0.7">
            <Stop offset="0" stopColor={accent} stopOpacity={0.35} />
            <Stop offset="0.6" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${a})`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${b})`} />
      </Svg>
    </View>
  );
}
