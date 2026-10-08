// src/hooks/useMicGesture.ts
// Hold-to-record gesture for the mic button. Wire the result to a GestureDetector
// that wraps the (always-mounted) mic button — unmounting it mid-hold would end the gesture.
import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

import type { useVoiceRecorder } from "./useVoiceRecorder";

export function useMicGesture(voiceRecorder: ReturnType<typeof useVoiceRecorder>) {
  const { onHoldStart, onHoldMove, onHoldEnd, onHoldCancel } = voiceRecorder.micGesture;
  return useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .shouldCancelWhenOutside(false)
        .onBegin(() => scheduleOnRN(onHoldStart))
        .onUpdate((e) => scheduleOnRN(onHoldMove, e.translationX, e.translationY))
        .onEnd((_e, success) => scheduleOnRN(success ? onHoldEnd : onHoldCancel))
        .onFinalize((_e, success) => {
          if (!success) scheduleOnRN(onHoldCancel);
        }),
    [onHoldStart, onHoldMove, onHoldEnd, onHoldCancel]
  );
}
