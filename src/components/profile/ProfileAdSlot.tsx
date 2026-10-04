// src/components/profile/ProfileAdSlot.tsx
// A slim sponsored strip in the owner's profile toolbar. Image or looping muted
// video; tapping opens the advertiser's link. Renders an empty box when there's
// no matching ad, so the toolbar layout never shifts.
import * as Linking from "expo-linking";
import { useVideoPlayer, VideoView } from "expo-video";
import { Pressable, View } from "react-native";

import { Image } from "@/components/ui/styled";
import { useActiveProfileAd } from "@/hooks/useAdCreatives";

function AdVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} contentFit="cover" nativeControls={false} style={{ width: "100%", height: "100%" }} />;
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
          <Pressable onPress={() => void Linking.openURL(creative.link_url!)} accessibilityRole="link" className="h-full w-full">
            {media}
          </Pressable>
        ) : (
          media
        )
      ) : null}
    </View>
  );
}
