// src/lib/presence.ts
export type PresenceStatus = "online" | "recent" | "offline";

// Must stay > the heartbeat interval in useAuth.tsx (45s) with slack
// for network delay — this is what "online" means, there's no separate
// realtime presence channel.
const ONLINE_THRESHOLD_MS = 90 * 1000;
const RECENT_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3h

export function getPresenceStatus(lastSeenAt: string | null | undefined): PresenceStatus {
  if (!lastSeenAt) return "offline";
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff < ONLINE_THRESHOLD_MS) return "online";
  if (diff < RECENT_THRESHOLD_MS) return "recent";
  return "offline";
}

/** WhatsApp-style label: "Online", "Last seen today at 2:41 PM", "Last seen yesterday at 9:03 AM", "Last seen Aug 14 at 6:12 PM". */
export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "Offline";
  if (getPresenceStatus(lastSeenAt) === "online") return "Online";

  const date = new Date(lastSeenAt);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) return `Last seen today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Last seen yesterday at ${time}`;

  return `Last seen ${date.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}
