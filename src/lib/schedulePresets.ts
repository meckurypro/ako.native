// src/lib/schedulePresets.ts
// Small helpers behind the "Schedule post" sheet: a default time, validation, and the wording that confirms
// exactly when the post will go live. All times are the device's local time.

/** A scheduled post must be at least this far in the future (the publisher runs once a minute). */
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** "Tue, Oct 20 at 9:00 AM" — used in the confirmation line and the toast. */
export function formatScheduleShort(date: Date): string {
  const day = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day} at ${formatTime(date)}`;
}

export function isFarEnough(date: Date, now: Date = new Date()): boolean {
  return date.getTime() >= now.getTime() + MIN_SCHEDULE_LEAD_MS;
}

/** Pre-filled value so the button is never a dead end: tomorrow at 9:00 AM. */
export function defaultSchedule(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}
