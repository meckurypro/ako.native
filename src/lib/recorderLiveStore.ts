// src/lib/recorderLiveStore.ts
//
// High-frequency recorder state (timer, drag offset, live waveform, playback position) lives in this
// tiny external store instead of React state inside useVoiceRecorder.
//
// Why: useVoiceRecorder is called by the chat screen itself. Keeping a 60 Hz audio-level array, a
// 10 Hz timer and a per-pointermove drag offset in useState re-rendered the WHOLE thread (message list,
// composer, header …) on every tick while recording, which is what made the chat feel sluggish.
// Here only the components that call `useRecorderLive` (the recording bar) re-render; the screen
// re-renders only for discrete changes (phase / locked / paused).
import { useSyncExternalStore } from "react";

export interface RecorderLive {
  elapsedMs: number;
  drag: { x: number; y: number };
  levels: number[];
  /** Playhead of the "listen to what I've recorded so far" clip while paused (ms). */
  playbackMs: number;
}

export type RecorderLiveStore = ReturnType<typeof createRecorderLiveStore>;

export function createRecorderLiveStore(idleLevels: number[]) {
  let state: RecorderLive = { elapsedMs: 0, drag: { x: 0, y: 0 }, levels: idleLevels, playbackMs: 0 };
  const listeners = new Set<() => void>();
  return {
    get: (): RecorderLive => state,
    set(patch: Partial<RecorderLive>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useRecorderLive(store: RecorderLiveStore): RecorderLive {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
