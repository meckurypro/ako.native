// File: supabase/functions/send-message-push/preview.ts
// The one-line summary of a chat message that goes in the push body (what the notification tray shows).
// Mirrors the app's messagePreview() (src/lib/chatMedia.ts): voice notes and media are stored in
// messages.content as "<marker><payload>", so the raw column must never be shown as text.
const VOICE_MARKER = "ako-voice-note:v1:";
const MEDIA_MARKER = "ako-media:v1:";
const FALLBACK = "Sent you a message";
/** Android's expanded notification shows long text; this keeps one push well inside FCM's payload limit. */
export const MAX_PREVIEW_CHARS = 240;

function clip(text: string): string {
  const chars = Array.from(text);
  return chars.length > MAX_PREVIEW_CHARS ? `${chars.slice(0, MAX_PREVIEW_CHARS).join("").trimEnd()}...` : text;
}

export function pushPreview(content: string | null | undefined): string {
  if (!content) return FALLBACK;
  if (content.startsWith(VOICE_MARKER)) return "Voice message";

  if (content.startsWith(MEDIA_MARKER)) {
    try {
      const payload = JSON.parse(content.slice(MEDIA_MARKER.length));
      const items: { kind?: string; name?: string }[] = Array.isArray(payload?.items) ? payload.items : [];
      if (!items.length) return FALLBACK;
      const caption = typeof payload.caption === "string" ? payload.caption.trim() : "";
      if (items[0].kind === "document") {
        const name = typeof items[0].name === "string" && items[0].name ? items[0].name : "Document";
        return clip(caption ? `${name}: ${caption}` : name);
      }
      const label = items.length === 1 ? "Photo" : `${items.length} photos`;
      return clip(caption ? `${label}: ${caption}` : label);
    } catch {
      return FALLBACK;
    }
  }

  const text = content.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return text ? clip(text) : FALLBACK;
}
