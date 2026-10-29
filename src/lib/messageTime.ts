// src/lib/messageTime.ts

/**
 * WhatsApp shows a bare "h:mm" (12- or 24-hour, following the device's
 * own locale/settings rather than forcing one format) inside every
 * message bubble — no seconds, no date. Mirrors the same
 * `toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })`
 * pattern this codebase already uses for "Last seen" (see
 * lib/presence.ts) so both surfaces read consistently.
 */
export function formatMessageTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * A stable per-calendar-day key (in the viewer's local time zone) used
 * to detect when consecutive messages cross a day boundary, so the
 * thread can insert a date separator between them. Two timestamps a
 * few minutes apart just either side of midnight must resolve to
 * different keys — hence bucketing by local Y/M/D rather than by
 * elapsed time.
 */
export function dayKeyFor(createdAt: string): string {
  const d = startOfDay(new Date(createdAt));
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * WhatsApp's date-separator label: "Today" / "Yesterday" for the two
 * most recent days, the bare weekday name ("Monday") for anything
 * else within the last 6 days, and the full date ("28 August 2026")
 * beyond that — the same three-tier scheme WhatsApp, Telegram, and
 * most chat apps converged on, since a bare weekday would be
 * ambiguous past a week and a full date is needless clutter within it.
 */
export function formatMessageDayLabel(createdAt: string): string {
  const day = startOfDay(new Date(createdAt));
  const today = startOfDay(new Date());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return day.toLocaleDateString([], { weekday: "long" });
  return day.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}

/** True when the device clock is 24-hour, so "00:41" can keep its leading zero ("1:05 PM" on a 12-hour clock). */
function uses24HourClock(locales: string | string[]): boolean {
  try {
    const cycle = new Intl.DateTimeFormat(locales, { hour: "numeric" }).resolvedOptions().hourCycle;
    return cycle === "h23" || cycle === "h24";
  } catch {
    return false;
  }
}

/**
 * The stamp on a row in the Chats list. Counted in calendar days (the viewer's local midnight), not 24-hour
 * blocks, so a message from 23:50 last night is "Yesterday" at 00:10 rather than "today":
 *   today → the time of day (device 12/24-hour setting) · 1 day → "Yesterday" · 2–7 days → "2d ago" … "7d ago"
 *   8–14 days → "Last week" · older → the date (device locale order, e.g. 28/10/2026).
 * A timestamp slightly in the future (clock skew) is treated as today. `now` and `locales` exist for tests.
 */
export function formatChatListTime(createdAt: string, now: Date = new Date(), locales: string | string[] = []): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  const diffDays = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000);

  if (diffDays <= 0) return d.toLocaleTimeString(locales, { hour: uses24HourClock(locales) ? "2-digit" : "numeric", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return `${diffDays}d ago`;
  if (diffDays <= 14) return "Last week";
  return d.toLocaleDateString(locales, { day: "2-digit", month: "2-digit", year: "numeric" });
}
