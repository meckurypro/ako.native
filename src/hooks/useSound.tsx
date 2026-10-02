// src/hooks/useSound.tsx
// Native port of the web SoundProvider. Same public API (enabled / mode /
// play), same persisted keys, same minimalist-mode filter — but sounds are
// bundled assets played through expo-audio. One lazily-created player per
// event is reused (rewound and replayed), and the volume is read from the
// audio bus at play time so UI sounds duck under real media.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "@/lib/polyfills";
import { getBusGain } from "../lib/audioBus";
import { MINIMALIST_EVENTS, SOUND_REGISTRY, type SoundEvent } from "../lib/sounds";

export type SoundMode = "minimalist" | "normal";

const ENABLED_KEY = "ako-sound-enabled";
const MODE_KEY = "ako-sound-mode";

function readStoredEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) !== "false"; // on by default
}

function readStoredMode(): SoundMode {
  return localStorage.getItem(MODE_KEY) === "minimalist" ? "minimalist" : "normal";
}

interface SoundContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  mode: SoundMode;
  setMode: (mode: SoundMode) => void;
  /** Play a registered sound event, respecting the current on/off + mode settings. */
  play: (event: SoundEvent) => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

/**
 * Wrap the app (see src/app/_layout.tsx). Swapping a placeholder for a real
 * designed sound never touches this file — replace the file in assets/sounds/
 * under the same name (registry: src/lib/sounds.ts).
 */
export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(readStoredEnabled);
  const [mode, setModeState] = useState<SoundMode>(readStoredMode);
  const players = useRef<Partial<Record<SoundEvent, AudioPlayer>>>({});

  function setEnabled(next: boolean) {
    localStorage.setItem(ENABLED_KEY, String(next));
    setEnabledState(next);
  }

  function setMode(next: SoundMode) {
    localStorage.setItem(MODE_KEY, next);
    setModeState(next);
  }

  // UI sounds respect the silent switch and mix with whatever the user is
  // already listening to (music, a podcast) instead of interrupting it.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: "mixWithOthers",
      allowsRecording: false,
      shouldPlayInBackground: false,
    }).catch(() => {});

    const cache = players.current;
    return () => {
      for (const key of Object.keys(cache) as SoundEvent[]) {
        try {
          cache[key]?.remove();
        } catch {
          /* already released */
        }
        delete cache[key];
      }
    };
  }, []);

  const play = useCallback(
    (event: SoundEvent) => {
      if (!enabled) return;
      if (mode === "minimalist" && !MINIMALIST_EVENTS.has(event)) return;

      const def = SOUND_REGISTRY[event];
      if (!def) return;

      try {
        let player = players.current[event];
        if (!player) {
          player = createAudioPlayer(def.source);
          players.current[event] = player;
        }
        player.volume = getBusGain();
        // Rewind first so rapid repeats (double-tap like) restart cleanly.
        void player.seekTo(0).catch(() => {});
        player.play();
      } catch {
        // A failed UI sound must never surface to the user; drop the cached
        // player so the next call rebuilds it.
        players.current[event] = undefined;
      }
    },
    [enabled, mode]
  );

  const value = useMemo(() => ({ enabled, setEnabled, mode, setMode, play }), [enabled, mode, play]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used within SoundProvider");
  return ctx;
}
