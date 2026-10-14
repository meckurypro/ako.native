// src/hooks/useMediaUrl.ts
// Resolves a chat media item to something an <Image> can load: the on-device copy once it's been downloaded,
// the local file while the message is still uploading, otherwise a (cached) signed URL for its storage path.
// `enabled: false` (a received item the user hasn't tapped to download yet) resolves nothing and makes no request.
import { useEffect, useState } from "react";

import { getLocalUri } from "../lib/chatMediaStore";
import type { MediaItem } from "../lib/chatMedia";
import { getSignedMediaUrl } from "../lib/signedMediaUrl";

export function useMediaUrl(item: MediaItem | undefined, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [url, setUrl] = useState<string | null>(item?.url ?? null);
  const [failed, setFailed] = useState(false);

  const local = item?.url;
  const path = item?.path;
  const downloaded = getLocalUri(item);

  useEffect(() => {
    setFailed(false);
    if (downloaded) {
      setUrl(downloaded);
      return;
    }
    if (local) {
      setUrl(local);
      return;
    }
    if (!path || !enabled) return;
    let cancelled = false;
    void getSignedMediaUrl(path).then((signed) => {
      if (cancelled) return;
      if (signed) setUrl(signed);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [local, path, enabled, downloaded]);

  return { url: downloaded ?? url, failed, uploading: !!local && !path };
}
