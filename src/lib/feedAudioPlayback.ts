// src/lib/feedAudioPlayback.ts
//
// "Only one relevant Feed soundtrack should play at a time" (see
// done/AKO_FEED_COMPOSER_SLIDES_MUSIC_UX_AUDIT.md §13-14). Same
// shape as src/lib/voicePlayback.ts's announcePlaying/clearPlaying —
// kept as its own module rather than folded into voicePlayback.ts
// because a post's music soundtrack and a voice-note bubble are
// different domains that happen to share one rule (single active
// playback), not the same feature.

let currentStop: (() => void) | null = null;

/** Call right before a post's music starts playing. Stops whichever
 *  other post's soundtrack was previously playing (if any), then
 *  registers `stop` as the new active one. */
export function announceMusicPlaying(stop: () => void): void {
  if (currentStop && currentStop !== stop) currentStop();
  currentStop = stop;
}

/** Call when playback pauses/ends/unmounts, so a stale stop callback
 *  can't fire and interrupt an unrelated later playback. */
export function clearMusicPlaying(stop: () => void): void {
  if (currentStop === stop) currentStop = null;
}
