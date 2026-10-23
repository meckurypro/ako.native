// src/components/ui/SafeVideoView.tsx
// VideoView that swaps to a gradient + video-icon placeholder when the file can't be loaded.
import { useEffect, useState, type ComponentProps } from "react";
import { VideoView } from "expo-video";

import { MediaPlaceholder } from "./MediaPlaceholder";

export function SafeVideoView(props: ComponentProps<typeof VideoView>) {
  const { player, style } = props;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!player) return;
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "error") setFailed(true);
      else if (status === "readyToPlay") setFailed(false);
    });
    return () => sub.remove();
  }, [player]);

  if (failed) return <MediaPlaceholder kind="video" seed="video" label="Video unavailable" style={style as never} />;
  return <VideoView {...props} />;
}
