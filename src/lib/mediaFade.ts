// src/lib/mediaFade.ts
// Tiny volume ramps so audio never starts or stops with a hard click. Works
// with any expo-audio AudioPlayer or expo-video VideoPlayer (both expose
// volume / play / pause). Timer-based instead of requestAnimationFrame.
export const FADE_SECONDS = 0.005;

export interface FadeablePlayer {
  volume: number;
  play(): void;
  pause(): void;
}

const STEP_MS = 8;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// A released native player throws on access; a fade must never crash the UI.
function safe(fn: () => void) {
  try {
    fn();
  } catch {
    /* player was released mid-fade */
  }
}

function rampVolume(player: FadeablePlayer, from: number, to: number, seconds: number, onDone?: () => void) {
  const steps = Math.max(1, Math.round((seconds * 1000) / STEP_MS));
  let i = 0;
  safe(() => {
    player.volume = clamp01(from);
  });
  const timer = setInterval(() => {
    i += 1;
    let failed = false;
    try {
      player.volume = clamp01(from + ((to - from) * i) / steps);
    } catch {
      failed = true;
    }
    if (failed || i >= steps) {
      clearInterval(timer);
      if (!failed) onDone?.();
    }
  }, STEP_MS);
}

/** Ramp volume to `target` without touching play/pause — for muting/unmuting live audio. */
export function fadeVolumeTo(player: FadeablePlayer | null | undefined, target: number, seconds = FADE_SECONDS): void {
  if (!player) return;
  safe(() => rampVolume(player, player.volume, target, seconds));
}

/** Start playback from silence, ramping up to `targetVolume`. */
export function fadeInAndPlay(player: FadeablePlayer, targetVolume = 1, seconds = FADE_SECONDS): void {
  safe(() => {
    player.volume = 0;
    player.play();
    rampVolume(player, 0, targetVolume, seconds);
  });
}

/** Fade to silence, then pause. Safe on a paused or already-released player. */
export function fadeOutAndPause(player: FadeablePlayer | null | undefined, seconds = FADE_SECONDS): void {
  if (!player) return;
  safe(() => {
    rampVolume(player, player.volume, 0, seconds, () => safe(() => player.pause()));
  });
}
