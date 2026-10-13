// src/components/ui/Avatar.tsx
import { useState } from "react";
import { View } from "react-native";

import { Image } from "./styled";
import { Text } from "./Text";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}

// Pixel sizes (w-8 / w-10 / w-16 / w-20). Applied as inline style so the avatar
// can never stretch with its row, whatever the image's intrinsic size is.
const PX = { sm: 32, md: 40, xl: 64, lg: 80 } as const;

const TEXT = {
  sm: "text-xs",
  md: "text-sm",
  xl: "text-xl",
  lg: "text-2xl",
} as const;

export function Avatar({ src, name, size = "md" }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const px = PX[size];
  const box = { width: px, height: px, borderRadius: px / 2, flexShrink: 0, overflow: "hidden" } as const;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (src && !failed) {
    return (
      <View style={box}>
        <Image
          source={{ uri: src }}
          accessibilityLabel={name}
          contentFit="cover"
          transition={120}
          recyclingKey={src}
          onError={() => setFailed(true)}
          style={{ width: px, height: px }}
        />
      </View>
    );
  }

  return (
    <View style={box} className="bg-accent-soft items-center justify-center">
      <Text className={`${TEXT[size]} font-medium text-accent`}>{initials}</Text>
    </View>
  );
}
