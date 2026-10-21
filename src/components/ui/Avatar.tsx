// src/components/ui/Avatar.tsx
import { useEffect, useState } from "react";
import { View } from "react-native";

import { useIsOnline } from "../../hooks/useIsOnline";
import { Image } from "./styled";
import { Text } from "./Text";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "vn" | "lg" | "xl" | "2xl";
}

// Pixel sizes (w-8 / w-10 / w-16 / w-20). Applied as inline style so the avatar
// can never stretch with its row, whatever the image's intrinsic size is.
const PX = { sm: 32, md: 40, vn: 48, xl: 64, lg: 80, "2xl": 112 } as const;

const TEXT = {
  sm: "text-xs",
  md: "text-sm",
  vn: "text-base",
  xl: "text-xl",
  lg: "text-2xl",
  "2xl": "text-4xl",
} as const;

export function Avatar({ src, name, size = "md" }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const online = useIsOnline();
  // A failed load is not permanent: a new picture, or the network coming back, earns another try.
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src, online]);
  const px = PX[size];
  const box = { width: px, height: px, borderRadius: px / 2, flexShrink: 0, overflow: "hidden" } as const;
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (src && !failed) {
    // Initials sit underneath until the picture is on screen (it may come from the device store, or be downloading),
    // so an avatar is never an empty circle.
    return (
      <View style={box} className="bg-accent-soft items-center justify-center">
        {!loaded && <Text className={`${TEXT[size]} font-medium text-accent`}>{initials}</Text>}
        <Image
          source={{ uri: src }}
          accessibilityLabel={name}
          contentFit="cover"
          transition={120}
          recyclingKey={src}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ position: "absolute", width: px, height: px }}
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
