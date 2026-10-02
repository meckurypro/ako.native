// src/lib/voicePlayback.ts
//
// Small shared state for voice-note bubbles, kept out of any single
// component because both pieces below are cross-bubble by nature:
//
//  1. Single active playback — WhatsApp-style "only one voice note
//     plays at a time." Each VoiceMessageBubble registers a stop
//     callback when it starts playing and calls `announcePlaying` for
//     itself; any bubble that was previously playing gets told to
//     pause. A plain module-level variable is enough here — there's
//     only ever at most one playing bubble, no need for context/state.
//
//  2. Remembered scrub position — WhatsApp resumes a voice note where
//     you left off if you scroll away and back or reopen the chat
//     while it's still mid-playback. Keyed by the message's audio URL
//     (stable for as long as the message exists) and kept in-memory
//     only for the session/tab — not persisted to storage, since it's
//     scoped to "did you leave this open mid-listen," not something
//     that should survive an app restart or accumulate indefinitely
//     across every voice note you've ever played.
//
// Playback speed is a separate, session-durable *preference* rather
// than per-message state, matching WhatsApp (speed is a setting you
// pick once, not something reset per note) — so that one lives in
// localStorage, next to the app's existing sound/theme prefs.

let currentStop: (() => void) | null = null;

/** Call right before a bubble starts playing. Pauses whichever other
 *  bubble was previously playing (if any), then registers `stop` as
 *  the new active one. */
export function announcePlaying(stop: () => void): void {
  if (currentStop && currentStop !== stop) currentStop();
  currentStop = stop;
}

/** Call when a bubble pauses/ends/unmounts, so a stale stop callback
 *  can't fire and re-pause an unrelated later playback. */
export function clearPlaying(stop: () => void): void {
  if (currentStop === stop) currentStop = null;
}

const rememberedPositions = new Map<string, number>();

export function getRememberedPosition(url: string): number {
  return rememberedPositions.get(url) ?? 0;
}

export function setRememberedPosition(url: string, seconds: number): void {
  rememberedPositions.set(url, seconds);
}

export function clearRememberedPosition(url: string): void {
  rememberedPositions.delete(url);
}

// "View once" voice notes: the recipient gets exactly one playthrough,
// then the bubble collapses to a spent placeholder — matching
// WhatsApp's view-once photos/videos, applied to voice notes. Tracked
// in localStorage (keyed by the message's stable audio key) rather
// than a DB column, since decodeVoiceNote's whole point is riding the
// existing `content` column with no schema change; "has this device's
// user already opened it" is a reasonable client-local proxy for that.
const OPENED_ONCE_STORAGE_KEY = "ako:voice-opened-once";

function readOpenedOnceSet(): Set<string> {
  try {
    const raw = localStorage.getItem(OPENED_ONCE_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function hasOpenedOnce(key: string): boolean {
  return readOpenedOnceSet().has(key);
}

export function markOpenedOnce(key: string): void {
  try {
    const set = readOpenedOnceSet();
    set.add(key);
    localStorage.setItem(OPENED_ONCE_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Storage unavailable — worst case the note replays once more.
  }
}

export const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

const SPEED_STORAGE_KEY = "ako:voice-playback-speed";

export function getPreferredPlaybackSpeed(): PlaybackSpeed {
  const raw = Number(localStorage.getItem(SPEED_STORAGE_KEY));
  return (PLAYBACK_SPEEDS as readonly number[]).includes(raw) ? (raw as PlaybackSpeed) : 1;
}

export function setPreferredPlaybackSpeed(speed: PlaybackSpeed): void {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(speed));
  } catch {
    // Storage unavailable (private mode, quota) — speed just won't
    // persist across sessions; still applies for the current one.
  }
}

export function nextPlaybackSpeed(current: PlaybackSpeed): PlaybackSpeed {
  const i = PLAYBACK_SPEEDS.indexOf(current);
  return PLAYBACK_SPEEDS[(i + 1) % PLAYBACK_SPEEDS.length];
}
