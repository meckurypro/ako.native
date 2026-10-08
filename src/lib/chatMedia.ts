// src/lib/chatMedia.ts
// Photos, albums and documents in chat. Like voice notes (see voiceNotes.ts) they
// ride the existing text-only `messages.content` column as a marker + JSON, so no
// schema change is needed and every other consumer of `content` just sees an opaque
// string. Use `messagePreview()` anywhere a one-line summary of a message is needed
// (chat list, reply quote, forward sheet…) instead of showing `content` directly.
//
// This file is identical in the web and native apps — keep it free of platform imports.
import { decodeVoiceNote, formatVoiceDuration, VOICE_NOTE_LABEL } from "./voiceNotes";

const MEDIA_MARKER = "ako-media:v1:";

export const CHAT_MEDIA_BUCKET = "chat-media";
export const MAX_ALBUM_ITEMS = 10;
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_CAPTION_LENGTH = 1024;

export type MediaKind = "image" | "document";

export interface MediaItem {
  kind: MediaKind;
  /** Object path in the private chat-media bucket — what a persisted message stores. */
  path?: string;
  /** Local/preview URL for the optimistic bubble while the upload is in flight. Never persisted. */
  url?: string;
  name: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
}

export interface MediaPayload {
  items: MediaItem[];
  caption?: string;
}

export function encodeMedia(payload: MediaPayload): string {
  return `${MEDIA_MARKER}${JSON.stringify(payload)}`;
}

/** Returns the decoded payload, or null for any other kind of message. */
export function decodeMedia(content: string): MediaPayload | null {
  if (!content || !content.startsWith(MEDIA_MARKER)) return null;
  try {
    const parsed = JSON.parse(content.slice(MEDIA_MARKER.length));
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    const items: MediaItem[] = [];
    for (const raw of parsed.items) {
      if (!raw || (raw.kind !== "image" && raw.kind !== "document")) return null;
      if (typeof raw.path !== "string" && typeof raw.url !== "string") return null;
      items.push({
        kind: raw.kind,
        path: typeof raw.path === "string" ? raw.path : undefined,
        url: typeof raw.url === "string" ? raw.url : undefined,
        name: typeof raw.name === "string" ? raw.name : "file",
        mime: typeof raw.mime === "string" ? raw.mime : "application/octet-stream",
        size: typeof raw.size === "number" ? raw.size : 0,
        width: typeof raw.width === "number" ? raw.width : undefined,
        height: typeof raw.height === "number" ? raw.height : undefined,
      });
    }
    return { items, caption: typeof parsed.caption === "string" && parsed.caption ? parsed.caption : undefined };
  } catch {
    return null;
  }
}

export type PreviewIcon = "mic" | "image" | "file" | null;

export interface MessagePreview {
  icon: PreviewIcon;
  /** What to show on one line: "Voice message", "Photo", "3 photos", the file name, or the text itself. */
  label: string;
  /** Secondary bit WhatsApp shows next to the icon in the chat list, e.g. a voice message's "0:12". */
  meta?: string;
}

/** One-line summary of any message content — text, voice message, photo(s) or document. */
export function messagePreview(content: string): MessagePreview {
  const voice = decodeVoiceNote(content);
  if (voice) return { icon: "mic", label: VOICE_NOTE_LABEL, meta: formatVoiceDuration(voice.durationSec) };

  const media = decodeMedia(content);
  if (media) {
    const first = media.items[0];
    if (first.kind === "document") return { icon: "file", label: first.name, meta: formatFileSize(first.size) || undefined };
    const n = media.items.length;
    const base = n === 1 ? "Photo" : `${n} photos`;
    return { icon: "image", label: media.caption ?? base };
  }

  return { icon: null, label: content };
}

/** Plain text version (search matching, share-out, clipboard) — never the raw encoded payload. */
export function messagePlainText(content: string): string {
  const media = decodeMedia(content);
  if (media) return media.caption ?? "";
  if (decodeVoiceNote(content)) return "";
  return content;
}

export function isMediaMessage(content: string): boolean {
  return !!content && content.startsWith(MEDIA_MARKER);
}

// ── file naming ────────────────────────────────────────────────────────────
// WhatsApp names what it saves IMG-20261008-WA0001.jpg / PTT-20261008-WA0001.opus.
// Same idea here with an AKO tag: the date plus a time-of-day counter, so names sort
// chronologically and two files sent in the same second still differ via `index`.

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export type ChatFilePrefix = "IMG" | "PTT" | "DOC";

export function chatFileName(prefix: ChatFilePrefix, ext: string, index = 0, when: Date = new Date()): string {
  const date = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
  const tod = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  const suffix = index > 0 ? `-${index + 1}` : "";
  return `${prefix}-${date}-AKO${tod}${suffix}.${ext.replace(/^\./, "").toLowerCase()}`;
}

/** Makes a user-supplied file name safe for a storage object path segment. */
export function safeStorageName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(-80);
  return cleaned || "file";
}

export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : "";
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

// ── document presentation ───────────────────────────────────────────────────
export interface DocumentStyle {
  /** Short badge shown on the file tile: PDF, DOC, XLS… */
  label: string;
  /** Tile colour — WhatsApp colours documents by type. Hex so it works on both platforms. */
  color: string;
}

export function documentStyle(name: string, mime?: string): DocumentStyle {
  const ext = fileExt(name);
  const m = mime ?? "";
  if (ext === "pdf" || m === "application/pdf") return { label: "PDF", color: "#D64545" };
  if (["doc", "docx", "rtf", "odt"].includes(ext)) return { label: ext.toUpperCase().slice(0, 4), color: "#3B6FD4" };
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return { label: ext.toUpperCase().slice(0, 4), color: "#2E9E5B" };
  if (["ppt", "pptx", "key", "odp"].includes(ext)) return { label: ext.toUpperCase().slice(0, 4), color: "#D9822B" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { label: ext.toUpperCase().slice(0, 4), color: "#8A6D3B" };
  if (["txt", "md", "log"].includes(ext)) return { label: ext.toUpperCase().slice(0, 4), color: "#6B7280" };
  if (m.startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac"].includes(ext)) return { label: ext ? ext.toUpperCase().slice(0, 4) : "AUDIO", color: "#E0782B" };
  if (m.startsWith("video/") || ["mp4", "mov", "mkv", "avi", "webm"].includes(ext)) return { label: ext ? ext.toUpperCase().slice(0, 4) : "VIDEO", color: "#7A55D6" };
  return { label: ext ? ext.toUpperCase().slice(0, 4) : "FILE", color: "#6B7280" };
}

/** Album layout: how many tiles are visible and how many extra are hidden behind "+N". */
export function albumLayout(count: number): { shown: number; extra: number } {
  const shown = Math.min(count, 4);
  return { shown, extra: Math.max(0, count - shown) };
}
