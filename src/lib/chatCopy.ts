// src/lib/chatCopy.ts
// Copying several messages at once, the way WhatsApp does it: one line per message, oldest first, each prefixed with
// "[time, date] Sender:". A message that runs over several lines keeps its own line breaks underneath. Deleted
// messages are left out; photos / voice notes / files contribute their label ("Photo", "Voice message", the file name).
import { messagePlainText, messagePreview } from "./chatMedia";

export interface CopyableMessage {
  sender_id: string;
  created_at: string;
  content: string;
  is_deleted?: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "14:05, 30/10/2026" in the reader's local time. */
export function formatCopyStamp(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatMessagesForCopy(messages: CopyableMessage[], nameFor: (senderId: string) => string): string {
  return [...messages]
    .filter((m) => !m.is_deleted)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((m) => {
      const body = messagePlainText(m.content).trim() || messagePreview(m.content).label;
      return body ? `[${formatCopyStamp(m.created_at)}] ${nameFor(m.sender_id)}: ${body}` : "";
    })
    .filter(Boolean)
    .join("\n");
}
