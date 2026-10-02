// src/components/ui/Avatar.tsx
import { View } from "react-native";

import { Image } from "./styled";
import { Text } from "./Text";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const BOX = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  xl: "w-16 h-16",
  lg: "w-20 h-20",
} as const;

const TEXT = {
  sm: "text-xs",
  md: "text-sm",
  xl: "text-xl",
  lg: "text-2xl",
} as const;

export function Avatar({ src, name, size = "md" }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (src) {
    return (
      <Image
        source={{ uri: src }}
        accessibilityLabel={name}
        contentFit="cover"
        transition={120}
        recyclingKey={src}
        className={`${BOX[size]} rounded-full shrink-0`}
      />
    );
  }

  return (
    <View className={`${BOX[size]} rounded-full bg-accent-soft items-center justify-center shrink-0`}>
      <Text className={`${TEXT[size]} font-medium text-accent`}>{initials}</Text>
    </View>
  );
}
