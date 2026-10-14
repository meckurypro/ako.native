// src/lib/voiceAudioSession.ts
//
// Voice notes are user-initiated playback, so — like WhatsApp — they must be audible even when the phone
// is on silent/vibrate. The app-wide audio mode (hooks/useSound.tsx) is `playsInSilentMode: false` so
// that UI sounds respect the silent switch; expo-audio's own docs note that on Android that setting
// SUPPRESSES playback whenever the ringer is silent or vibrate (and iOS mutes on the silent switch too).
// That is why recorded voice notes played with no sound. Playback therefore flips the session into a
// "media" mode for as long as a note is playing, then restores the UI-sound mode.
//
// Ref-counted so two overlapping players (e.g. the preview bar and a bubble) never restore it early.
import { setAudioModeAsync } from "expo-audio";

let holders = 0;

export async function enterVoicePlaybackMode(): Promise<void> {
  holders += 1;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
      allowsRecording: false, // also drops iOS's earpiece route left over from recording
      shouldRouteThroughEarpiece: false,
      shouldPlayInBackground: false,
    });
  } catch {
    /* best effort — playback still attempts */
  }
}

export function leaveVoicePlaybackMode(): void {
  holders = Math.max(0, holders - 1);
  if (holders > 0) return;
  // Back to the app-wide UI-sound mode (see hooks/useSound.tsx).
  setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: "mixWithOthers",
    allowsRecording: false,
    shouldPlayInBackground: false,
  }).catch(() => {});
}
