// src/lib/voiceNotes.ts

const VOICE_NOTE_MARKER = "ako-voice-note:v1:";

export interface VoiceNotePayload {
  /** Playable immediately, no signing needed. Populated for the
   *  optimistic bubble (the recorder's own local blob: URL, still
   *  valid while the real upload is in flight) — never written for a
   *  persisted message, since the "audio" bucket is private and a
   *  plain URL to it wouldn't be readable anyway. Exactly one of
   *  `url` / `path` is present on any given payload. */
  url?: string;
  /** Storage object path in the private "audio" bucket — what a
   *  persisted voice note actually stores. Resolved to a short-lived
   *  signed URL at render time (see lib/signedAudioUrl.ts) rather than
   *  a stored URL, since a signed URL itself expires and would go
   *  stale sitting in a message someone reopens days later. */
  path?: string;
  durationSec: number;
  /** Waveform bar heights (0..1), computed client-side at record time.
   *  Optional so older, already-sent voice notes without this field
   *  still decode fine — the bubble falls back to fetching and
   *  decoding the audio itself when it's missing. */
  peaks?: number[];
  /** WhatsApp-style "view once" — plays a single time, then the
   *  bubble collapses to a spent placeholder. Optional/omitted for
   *  every normal voice note, so old messages decode unaffected. */
  viewOnce?: boolean;
}

/**
 * Packs a voice note's storage reference + duration into a plain
 * message `content` string, so voice notes can ride the existing
 * text-only `messages.content` column without a schema change. Every
 * other message-content consumer in the app (search, reply snippets,
 * conversation-list previews) just sees an opaque string it doesn't
 * match against this marker, so nothing else needs to change to stay
 * backward compatible.
 */
export function encodeVoiceNote(payload: VoiceNotePayload): string {
  return `${VOICE_NOTE_MARKER}${JSON.stringify(payload)}`;
}

/** Returns the decoded payload, or null for an ordinary text message. */
export function decodeVoiceNote(content: string): VoiceNotePayload | null {
  if (!content || !content.startsWith(VOICE_NOTE_MARKER)) return null;
  try {
    const parsed = JSON.parse(content.slice(VOICE_NOTE_MARKER.length));
    const hasUrl = typeof parsed?.url === "string";
    const hasPath = typeof parsed?.path === "string";
    if (parsed && (hasUrl || hasPath) && typeof parsed.durationSec === "number") {
      const peaks =
        Array.isArray(parsed.peaks) && parsed.peaks.every((p: unknown) => typeof p === "number")
          ? parsed.peaks
          : undefined;
      return {
        url: hasUrl ? parsed.url : undefined,
        path: hasPath ? parsed.path : undefined,
        durationSec: parsed.durationSec,
        peaks,
        viewOnce: parsed.viewOnce === true ? true : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Plain-text stand-in for a voice note wherever raw text is expected
 *  (reply-to quote snippets, search matching, forwarding preview). */
export const VOICE_NOTE_LABEL = "Voice note";

/** mm:ss formatting shared by the recorder UI and playback bubble. */
export function formatVoiceDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
