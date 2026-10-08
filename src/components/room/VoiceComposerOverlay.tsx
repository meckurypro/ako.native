// src/components/room/VoiceComposerOverlay.tsx
// Recording / preview bars drawn over a composer row. While merely HOLDING the mic the finger is on
// the button underneath, so the overlay ignores touches; once locked or in preview it takes them.
import { View } from "react-native";

import { VoicePreviewBar } from "@/components/messages/VoicePreviewBar";
import { VoiceRecordingBar } from "@/components/messages/VoiceRecordingBar";
import type { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

type Recorder = ReturnType<typeof useVoiceRecorder>;

export function VoiceComposerOverlay({ recorder, allowViewOnce = false }: { recorder: Recorder; allowViewOnce?: boolean }) {
  if (recorder.phase === "idle") return null;
  return (
    <View className="absolute inset-0 bg-canvas" pointerEvents={recorder.phase === "preview" || recorder.locked ? "auto" : "none"}>
      {recorder.phase === "recording" ? (
        <VoiceRecordingBar
          locked={recorder.locked}
          paused={recorder.paused}
          elapsedMs={recorder.elapsedMs}
          drag={recorder.drag}
          cancelThresholdPx={recorder.cancelThresholdPx}
          lockThresholdPx={recorder.lockThresholdPx}
          liveLevels={recorder.liveLevels}
          onCancel={recorder.cancelRecording}
          onTogglePause={recorder.togglePauseResume}
          onStop={recorder.stopToPreview}
        />
      ) : null}
      {recorder.phase === "preview" && recorder.preview ? (
        <VoicePreviewBar
          url={recorder.preview.url}
          durationSec={recorder.preview.durationSec}
          peaks={recorder.preview.peaks}
          sending={recorder.sending}
          viewOnce={allowViewOnce ? recorder.preview.viewOnce : undefined}
          onToggleViewOnce={allowViewOnce ? recorder.toggleViewOnce : undefined}
          onDiscard={recorder.discardPreview}
          onSend={recorder.sendPreview}
        />
      ) : null}
    </View>
  );
}
