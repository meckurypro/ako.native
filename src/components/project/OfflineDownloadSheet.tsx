// src/components/project/OfflineDownloadSheet.tsx
// Progress for "Download to library": a sheet with a real progress bar (bytes, not a spinner), Cancel while it runs, and
// a plain-language error with Retry if it fails. Closing the sheet (X / drag) hides it WITHOUT stopping the download —
// Cancel is the only thing that stops it. Render conditionally, like every overlay.
import { ActivityIndicator, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Text } from "@/components/ui/Text";
import { formatBytes, offlineErrorMessage } from "@/lib/offlineProjects";
import type { DownloadState } from "@/lib/offlineStore";
import { useTheme } from "@/theme/ThemeProvider";

interface Props {
  title: string;
  state: DownloadState;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
}

export function OfflineDownloadSheet({ title, state, onCancel, onRetry, onClose }: Props) {
  const { colors } = useTheme();
  const failed = state.phase === "failed";
  const pct = Math.round(state.progress * 100);
  const showBar = state.phase === "downloading" || state.phase === "saving";

  const status = failed
    ? offlineErrorMessage(state.error)
    : state.phase === "preparing"
      ? "Checking your access…"
      : state.phase === "saving"
        ? "Saving to your library…"
        : state.totalBytes > 0
          ? `${formatBytes(state.receivedBytes)} of ${formatBytes(state.totalBytes)} · ${pct}%`
          : `${pct}%`;

  return (
    <SheetFrame
      title={failed ? "Couldn't download" : "Downloading"}
      subtitle={title}
      onClose={onClose}
      zIndex={65}
      scrim="ink"
      footer={
        failed ? (
          <View className="gap-2">
            {/* Only worth retrying when the problem might be temporary. */}
            {state.error && ["offline", "failed"].includes(state.error.code) ? <Button onPress={onRetry}>Try again</Button> : null}
            <Button variant="ghost" onPress={onClose}>
              Close
            </Button>
          </View>
        ) : (
          <Button variant="secondary" onPress={onCancel} disabled={state.phase === "saving"}>
            Cancel download
          </Button>
        )
      }
    >
      <View className="gap-3 py-2">
        {showBar ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={`Downloading ${title}`}
            accessibilityValue={{ min: 0, max: 100, now: pct }}
            className="h-2 w-full overflow-hidden rounded-full bg-canvas"
          >
            <View className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
          </View>
        ) : failed ? null : (
          <ActivityIndicator color={colors.accent} />
        )}
        <Text accessibilityLiveRegion="polite" className={`text-sm ${failed ? "text-danger" : "text-ink-muted"}`}>
          {status}
        </Text>
        {!failed ? <Text className="text-xs text-ink-muted">Stay in the app until this finishes. You can close this and keep browsing.</Text> : null}
      </View>
    </SheetFrame>
  );
}
