// src/components/ui/ExternalLinkDialog.tsx
// Mounted once at the root. Shows the "Leaving Akọ" prompt for any link opened through openExternal.
import { useEffect, useState } from "react";

import { openConfirmed, subscribeExternal, type PendingExternal } from "@/lib/openExternal";
import { ConfirmDialog } from "./ConfirmDialog";

export function ExternalLinkDialog() {
  const [pending, setPending] = useState<PendingExternal | null>(null);
  useEffect(() => subscribeExternal(setPending), []);
  if (!pending) return null;
  return (
    <ConfirmDialog
      danger={false}
      title="Leaving Akọ"
      description={`This link opens ${pending.host}.`}
      cancelLabel="Stay"
      confirmLabel="Continue"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const { url } = pending;
        setPending(null);
        void openConfirmed(url);
      }}
    />
  );
}
