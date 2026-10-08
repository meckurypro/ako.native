// src/hooks/useMediaUrl.ts
// Resolves a chat media item to something an <Image> can load: the local file while the
// message is still uploading, otherwise a (cached) signed URL for its storage path.
import { useEffect, useState } from "react";

import type { MediaItem } from "../lib/chatMedia";
import { getSignedMediaUrl } from "../lib/signedMediaUrl";

export function useMediaUrl(item: MediaItem | undefined) {
  const [url, setUrl] = useState<string | null>(item?.url ?? null);
  const [failed, setFailed] = useState(false);

  const local = item?.url;
  const path = item?.path;

  useEffect(() => {
    setFailed(false);
    if (local) {
      setUrl(local);
      return;
    }
    if (!path) return;
    let cancelled = false;
    void getSignedMediaUrl(path).then((signed) => {
      if (cancelled) return;
      if (signed) setUrl(signed);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [local, path]);

  return { url, failed, uploading: !!local && !path };
}
