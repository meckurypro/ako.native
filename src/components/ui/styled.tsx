// src/components/ui/styled.tsx
// className-enabled wrappers for third-party components. Core React Native
// components (View, Text, Pressable, TextInput, ScrollView…) get className
// automatically through NativeWind's Metro resolver; anything else needs the
// small bridge below.
import { Image as ExpoImage, type ImageProps as ExpoImageProps } from "expo-image";
import type { LucideIcon, LucideProps } from "lucide-react-native";
import { useCssElement } from "react-native-css";

/** expo-image with className (rounded-full, w-10, h-10, …). */
export function Image(props: ExpoImageProps & { className?: string }) {
  return useCssElement(ExpoImage, props, { className: "style" });
}

type IconProps = Omit<LucideProps, "ref"> & {
  /** Any lucide icon, e.g. `as={Check}`. */
  as: LucideIcon;
  /** Tailwind classes — `text-accent` etc. set the icon colour, like on web. */
  className?: string;
};

/**
 * Lucide icon with className. On web the icons inherit `currentColor`, so the
 * codebase colours them with `text-*` classes; this maps that colour onto the
 * icon's `color` prop so those class names keep working unchanged.
 *   <Icon as={Check} size={18} className="text-tick-blue" />
 */
export function Icon({ as: Component, ...props }: IconProps) {
  return useCssElement(Component, props, {
    className: { target: "style", nativeStyleMapping: { color: true } },
  });
}
