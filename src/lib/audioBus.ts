// src/lib/audioBus.ts
// UI sounds (likes, message-sent, gifts…) must never talk over real media — a
// voice note, a post's video, a live Room. The web version did this with one
// Web Audio master GainNode. Native has no shared graph, so this is the same
// idea reduced to its essence: a ref-counted "duck" flag plus a gain value
// that every UI sound reads at the moment it plays (see hooks/useSound.tsx).
//
// Anything that plays real media calls duckAudioBus() when it starts and
// unduckAudioBus() when it stops/ends/unmounts — or just uses the
// useDuckWhile(active) hook, which does both automatically.
const NORMAL_GAIN = 1.0;
const DUCKED_GAIN = 0.35;

let duckCount = 0;

export function getBusGain(): number {
  return duckCount > 0 ? DUCKED_GAIN : NORMAL_GAIN;
}

export function duckAudioBus(): void {
  duckCount += 1;
}

export function unduckAudioBus(): void {
  duckCount = Math.max(0, duckCount - 1);
}
