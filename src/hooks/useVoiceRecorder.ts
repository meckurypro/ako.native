// src/hooks/useVoiceRecorder.ts
// Native port of the hold-to-record voice note recorder.
//
// Same UX contract as web (WhatsApp-style):
//   hold the mic            → recording
//   drag left past 80px     → cancel
//   drag up past 64px       → lock (hands-free; stop/pause via the toolbar)
//   release (unlocked)      → preview (listen, toggle view-once, send/discard)
//
// What changed underneath:
//   • MediaRecorder + getUserMedia → expo-audio's AudioRecorder (m4a/AAC)
//   • window pointer listeners     → the mic button's own gesture reports
//     start / move / end / cancel through `micGesture` (wire it to a
//     Gesture Handler pan/long-press in the component)
//   • Blob + object URL            → LocalFile (file:// URI)
//   • Web Audio waveform analysis  → the recorder's metering readings, bucketed
//     into bars as it records (see lib/waveform.ts) — no post-processing
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { File as FsFile } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalFile } from "../lib/localFile";
import { dbToLevel, peaksFromMetering, WAVEFORM_BAR_COUNT } from "../lib/waveform";

const CANCEL_THRESHOLD_PX = 80;
const LOCK_THRESHOLD_PX = 64;
const METER_INTERVAL_MS = 80;
const TAP_CANCEL_MS = 400; // released almost instantly = a tap, not a hold
const IDLE_LEVELS = Array(WAVEFORM_BAR_COUNT).fill(0.08);

export type VoiceRecorderPhase = "idle" | "recording" | "preview";

interface PreviewData {
  file: LocalFile;
  /** Same as file.uri — playable immediately in the preview bar and the optimistic bubble. */
  url: string;
  durationSec: number;
  peaks: number[];
  viewOnce: boolean;
}

// Mono 64kbps AAC is plenty for speech and keeps uploads small.
const VOICE_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
};

export function useVoiceRecorder(
  onSend: (file: LocalFile, durationSec: number, peaks: number[], viewOnce: boolean) => Promise<void>
) {
  const recorder = useAudioRecorder(VOICE_OPTIONS);

  const [phase, setPhase] = useState<VoiceRecorderPhase>("idle");
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [sending, setSending] = useState(false);
  const [liveLevels, setLiveLevels] = useState<number[]>(IDLE_LEVELS);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterSamplesRef = useRef<number[]>([]);
  const segmentStartRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const pausedRef = useRef(false);
  const lockedRef = useRef(false); // mirrors `locked` for use inside gesture callbacks
  const endedRef = useRef(false); // true once cancel/stop has resolved this hold, so a trailing release is a no-op
  const startingRef = useRef(false); // permission prompt / prepare still in flight
  const releasedEarlyRef = useRef(false); // finger lifted while still starting

  const stopTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (meterRef.current) clearInterval(meterRef.current);
    timerRef.current = null;
    meterRef.current = null;
  }, []);

  const releaseAudioSession = useCallback(() => {
    stopTimers();
    setLiveLevels(IDLE_LEVELS);
    // Back to playback routing (iOS keeps the earpiece route while allowsRecording is on).
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: false }).catch(() => {});
  }, [stopTimers]);

  const startRecording = useCallback(async () => {
    startingRef.current = true;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) throw new Error("Microphone permission denied");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();

      lockedRef.current = false;
      endedRef.current = false;
      pausedRef.current = false;
      meterSamplesRef.current = [];
      setLocked(false);
      setPaused(false);
      setDrag({ x: 0, y: 0 });

      recorder.record();
      accumulatedMsRef.current = 0;
      segmentStartRef.current = Date.now();
      setElapsedMs(0);
      setPhase("recording");

      timerRef.current = setInterval(() => {
        setElapsedMs(accumulatedMsRef.current + (Date.now() - segmentStartRef.current));
      }, 100);

      meterRef.current = setInterval(() => {
        if (pausedRef.current) return;
        const db = recorder.getStatus().metering;
        meterSamplesRef.current.push(typeof db === "number" ? db : -160);
        const level = Math.max(0.08, dbToLevel(db));
        setLiveLevels((prev) => [...prev.slice(1), level]);
      }, METER_INTERVAL_MS);
    } catch {
      endedRef.current = true;
      releaseAudioSession();
      setPhase("idle");
    } finally {
      startingRef.current = false;
    }
  }, [recorder, releaseAudioSession]);

  const cancelRecording = useCallback(() => {
    endedRef.current = true;
    stopTimers();
    recorder.stop().catch(() => {});
    releaseAudioSession();
    meterSamplesRef.current = [];
    setPhase("idle");
    setLocked(false);
    lockedRef.current = false;
    setDrag({ x: 0, y: 0 });
  }, [recorder, releaseAudioSession, stopTimers]);

  const stopToPreview = useCallback(async () => {
    endedRef.current = true;
    const finalElapsedMs = pausedRef.current
      ? accumulatedMsRef.current
      : accumulatedMsRef.current + (Date.now() - segmentStartRef.current);
    stopTimers();

    try {
      await recorder.stop();
    } catch {
      releaseAudioSession();
      setPhase("idle");
      return;
    }

    const uri = recorder.uri;
    releaseAudioSession();
    if (!uri) {
      setPhase("idle");
      return;
    }

    let size = 0;
    try {
      size = new FsFile(uri).size ?? 0;
    } catch {
      /* size is informational only */
    }

    setPreview({
      file: { uri, name: `voice-${Date.now()}.m4a`, type: "audio/mp4", size },
      url: uri,
      durationSec: Math.max(1, Math.round(finalElapsedMs / 1000)),
      peaks: peaksFromMetering(meterSamplesRef.current),
      viewOnce: false,
    });
    setPhase("preview");
  }, [recorder, releaseAudioSession, stopTimers]);

  const togglePauseResume = useCallback(() => {
    if (pausedRef.current) {
      recorder.record(); // record() after pause() resumes the same file
      segmentStartRef.current = Date.now();
      pausedRef.current = false;
      setPaused(false);
    } else {
      recorder.pause();
      accumulatedMsRef.current += Date.now() - segmentStartRef.current;
      pausedRef.current = true;
      setPaused(true);
    }
  }, [recorder]);

  const toggleViewOnce = useCallback(() => {
    setPreview((prev) => (prev ? { ...prev, viewOnce: !prev.viewOnce } : prev));
  }, []);

  const discardPreview = useCallback(() => {
    setPreview((prev) => {
      if (prev) {
        try {
          new FsFile(prev.file.uri).delete();
        } catch {
          /* temp file — the OS cleans the cache anyway */
        }
      }
      return null;
    });
    setPhase("idle");
  }, []);

  const sendPreview = useCallback(async () => {
    if (!preview) return;
    setSending(true);
    try {
      await onSend(preview.file, preview.durationSec, preview.peaks, preview.viewOnce);
      try {
        new FsFile(preview.file.uri).delete();
      } catch {
        /* see discardPreview */
      }
      setPreview(null);
      setPhase("idle");
    } finally {
      setSending(false);
    }
  }, [preview, onSend]);

  // ── Gesture API: wire to the mic button's pan/long-press (Gesture Handler) ──
  const onHoldStart = useCallback(() => {
    endedRef.current = false;
    lockedRef.current = false;
    releasedEarlyRef.current = false;
    void startRecording();
  }, [startRecording]);

  /** dx/dy are finger translation from the hold's start point (dy < 0 = moved up). */
  const onHoldMove = useCallback(
    (dx: number, dy: number) => {
      if (lockedRef.current || endedRef.current) return;
      const up = -dy; // positive = finger moved up
      if (up > LOCK_THRESHOLD_PX) {
        lockedRef.current = true;
        setLocked(true);
        setDrag({ x: 0, y: 0 });
        return;
      }
      if (dx < -CANCEL_THRESHOLD_PX) {
        cancelRecording();
        return;
      }
      setDrag({ x: Math.min(0, dx), y: Math.max(0, up) });
    },
    [cancelRecording]
  );

  const onHoldEnd = useCallback(() => {
    if (startingRef.current) {
      releasedEarlyRef.current = true; // lifted before recording even began
      // A tap, not a hold — cancel as soon as start settles.
      const wait = setInterval(() => {
        if (!startingRef.current) {
          clearInterval(wait);
          if (!endedRef.current && !lockedRef.current) cancelRecording();
        }
      }, 30);
      return;
    }
    if (endedRef.current || lockedRef.current) return; // locked → hands-free, only the toolbar ends it now
    const heldMs = accumulatedMsRef.current + (Date.now() - segmentStartRef.current);
    if (heldMs < TAP_CANCEL_MS) cancelRecording();
    else void stopToPreview();
  }, [cancelRecording, stopToPreview]);

  const onHoldCancel = useCallback(() => {
    if (endedRef.current || lockedRef.current) return;
    cancelRecording();
  }, [cancelRecording]);

  // Never leave the mic open if the screen unmounts mid-recording.
  useEffect(() => {
    return () => {
      stopTimers();
      if (!endedRef.current) recorder.stop().catch(() => {});
    };
  }, [recorder, stopTimers]);

  return {
    phase,
    locked,
    paused,
    elapsedMs,
    drag,
    liveLevels,
    preview,
    sending,
    cancelThresholdPx: CANCEL_THRESHOLD_PX,
    lockThresholdPx: LOCK_THRESHOLD_PX,
    micGesture: { onHoldStart, onHoldMove, onHoldEnd, onHoldCancel },
    cancelRecording,
    stopToPreview,
    togglePauseResume,
    toggleViewOnce,
    discardPreview,
    sendPreview,
  };
}
