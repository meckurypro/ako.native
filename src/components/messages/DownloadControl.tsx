// src/components/messages/DownloadControl.tsx
// The download affordances shared by photo tiles and document cards (WhatsApp-style):
//   • DownloadPill  — "↓ 1.2 MB" before you've tapped
//   • ProgressRing  — live ring with a ✕ to cancel while it downloads (spins when the total is unknown)
import { ArrowDown, RotateCw, X } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";

export function DownloadPill({ label, failed, onPress }: { label: string; failed?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={failed ? "Download failed. Tap to retry" : `Download${label ? ` ${label}` : ""}`}
      className="flex-row items-center gap-1.5 rounded-full bg-black-a50 px-3.5 py-2"
    >
      <Icon as={failed ? RotateCw : ArrowDown} size={18} color="#FFFFFF" />
      <Text className="text-[13px] font-medium text-white">{failed ? "Retry" : label || "Download"}</Text>
    </Pressable>
  );
}

export function ProgressRing({
  progress,
  size = 52,
  onCancel,
  dark = true,
}: {
  /** 0..1, or a negative number for "unknown" (indeterminate spinner). */
  progress: number;
  size?: number;
  onCancel: () => void;
  /** White-on-dark (over a photo) vs ink-on-light (in a document card). */
  dark?: boolean;
}) {
  const stroke = Math.max(2.5, size / 16);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const indeterminate = progress < 0;
  const shown = indeterminate ? 0.28 : Math.max(0.04, Math.min(1, progress));
  const spin = useSharedValue(0);

  useEffect(() => {
    if (!indeterminate) return;
    spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1);
    return () => cancelAnimation(spin);
  }, [indeterminate, spin]);

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const color = dark ? "#FFFFFF" : "#6B675F";

  return (
    <Pressable
      onPress={onCancel}
      accessibilityRole="button"
      accessibilityLabel="Cancel download"
      hitSlop={8}
      style={{ width: size, height: size }}
      className={`items-center justify-center rounded-full ${dark ? "bg-black-a50" : "bg-ink-muted-a15"}`}
    >
      <Animated.View style={[{ position: "absolute", width: size, height: size }, indeterminate ? spinStyle : { transform: [{ rotate: "-90deg" }] }]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeOpacity={0.25} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - shown)}
          />
        </Svg>
      </Animated.View>
      <View pointerEvents="none">
        <Icon as={X} size={Math.round(size * 0.38)} color={color} />
      </View>
    </Pressable>
  );
}
