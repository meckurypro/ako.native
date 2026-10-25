// src/components/customPage/Fx.tsx
// Micro-interactions and gradient layers for the richer Custom Page styles (midnight, aurora, soft, neo…).
// The app has no linear-gradient dependency, so gradients are react-native-svg fills. Everything here only animates
// opacity / transform and stands still when the system "reduce motion" setting is on.
import { useEffect, useId, useState, type ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

export interface Glow {
  /** 0–1 position and radius, as fractions of the page. */
  cx: number;
  cy: number;
  r: number;
  color: string;
  opacity: number;
}

/** Page backdrop made of a base colour plus soft radial glows. `drift` slowly pans it (Aurora). */
export function StyleBackdrop({ base, glows, drift }: { base: string; glows: Glow[]; drift?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!drift || reduce) return;
    t.value = withRepeat(withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [drift, reduce, t]);
  const pan = useAnimatedStyle(() => ({ transform: [{ translateX: (t.value - 0.5) * 70 }, { translateY: (0.5 - t.value) * 60 }, { scale: 1.25 }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: base, overflow: "hidden" }]}>
      <Animated.View style={[StyleSheet.absoluteFill, drift ? pan : null]}>
        <Svg width="100%" height="100%">
          <Defs>
            {glows.map((g, i) => (
              <RadialGradient key={i} id={`${uid}${i}`} cx={g.cx} cy={g.cy} r={g.r}>
                <Stop offset="0" stopColor={g.color} stopOpacity={g.opacity} />
                <Stop offset="1" stopColor={g.color} stopOpacity={0} />
              </RadialGradient>
            ))}
          </Defs>
          {glows.map((_, i) => (
            <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#${uid}${i})`} />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Diagonal two-colour fill for a button face. */
export function GradientFill({ from, to }: { from: string; to: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** A light band that sweeps across a button every few seconds. Parent must clip (overflow hidden). */
export function ShineSweep({ width }: { width: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    p.value = withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 4200 })), -1);
  }, [reduce, p]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -width * 0.5 + p.value * width * 1.7 }, { rotate: "20deg" }] }));
  if (reduce) return null;
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", top: -20, bottom: -20, left: 0, width: width * 0.28, backgroundColor: "rgba(255,255,255,0.32)" }, style]} />;
}

/** Gentle up-and-down float (logos in the softer styles). */
export function FloatView({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withRepeat(withTiming(1, { duration: 2750, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduce, t]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * t.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Tracks a view's width — the shine band needs it. */
export function useWidth() {
  const [w, setW] = useState(0);
  return { w, onLayout: (e: { nativeEvent: { layout: { width: number } } }) => setW(e.nativeEvent.layout.width) };
}
