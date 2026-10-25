// src/hooks/useFileDownload.ts
// "Preparing…" while we check the file, then a toast once the system has been handed the download.
import { useCallback, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { prepareDownload } from "@/lib/downloadFile";
import { openExternal } from "@/lib/openExternal";

const MESSAGES = {
  missing: "That file isn't available any more.",
  slow: "That took too long. Please try again.",
  open: "Couldn't start the download. Please try again.",
} as const;

export function useFileDownload() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const start = useCallback(
    async (url: string | null) => {
      if (!url || running.current) return;
      running.current = true;
      setBusy(true);
      try {
        const res = await prepareDownload(url);
        if (!res.ok) {
          toast(MESSAGES[res.reason], { variant: "error" });
          return;
        }
        const opened = await openExternal(url);
        toast(opened ? "Download started" : MESSAGES.open, { variant: opened ? "success" : "error" });
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [toast],
  );

  return { busy, start };
}
