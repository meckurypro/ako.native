// src/hooks/useDuckWhile.ts
// Ducks UI sounds for as long as `active` is true (e.g. while a voice note,
// video, or call is playing). Balanced automatically on change and unmount —
// replaces the web build's global document play/pause listener.
import { useEffect } from "react";
import { duckAudioBus, unduckAudioBus } from "../lib/audioBus";

export function useDuckWhile(active: boolean) {
  useEffect(() => {
    if (!active) return;
    duckAudioBus();
    return () => unduckAudioBus();
  }, [active]);
}
