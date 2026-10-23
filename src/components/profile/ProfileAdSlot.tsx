// src/components/profile/ProfileAdSlot.tsx
// A slim sponsored strip in the owner's profile toolbar. Image or looping muted
// video; tapping opens the advertiser's link. Renders an empty box when there's
// no matching ad, so the toolbar layout never shifts.
import { openExternal } from "@/lib/openExternal";
import { useVideoPlayer } from "expo-video";
import { SafeVideoView } from "../ui/SafeVideoView";
import { Pressable, View } from "react-native";

import { Image } from "@/components/ui/styled";
import { useActiveProfileAd } from "@/hooks/useAdCreatives";

function AdVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <SafeVideoView player={player} contentFit="cover" nativeControls={false} style={{ width: "100%", height: "100%" }} />;
}

export function ProfileAdSlot({ className = "" }: { className?: string }) {
  const { creative, mediaUrl } = useActiveProfileAd();

  const media =
    creative && mediaUrl ? (
      creative.media_type === "video" ? <AdVideo url={mediaUrl} /> : <Image source={{ uri: mediaUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
    ) : null;

  return (
    <View className={`h-10 overflow-hidden rounded-lg ${className}`}>
      {media ? (
        creative?.link_url ? (
          <Pressable onPress={() => void openExternal(creative.link_url!)} accessibilityRole="link" className="h-full w-full">
            {media}
          </Pressable>
        ) : (
          media
        )
      ) : null}
    </View>
  );
}
