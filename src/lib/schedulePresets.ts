// src/lib/schedulePresets.ts
// Pure helpers behind the "Schedule this post" sheet: quick-pick times, a sensible default, and the
// human wording that confirms exactly when the post will go live. All times are the device's local time.

/** A scheduled post must be at least this far in the future (the publisher runs once a minute). */
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

export interface SchedulePreset {
  key: string;
  label: string;
  /** Short time text shown under the label, e.g. "9:00 AM". */
  sub: string;
  date: Date;
}

function atHour(base: Date, hour: number): Date {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/** "Tue, Oct 20 at 9:00 AM" — used in the summary line and the confirmation toast. */
export function formatScheduleShort(date: Date): string {
  const day = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day} at ${formatTime(date)}`;
}

/** "in 35 min" / "in 13 hours" / "in 4 days". */
export function relativeFromNow(date: Date, now: Date = new Date()): string {
  const mins = Math.max(1, Math.round((date.getTime() - now.getTime()) / 60000));
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `in ${days} days`;
}

/** The device's IANA time zone (e.g. "Africa/Lagos"), when the runtime can tell us. */
export function localTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function isFarEnough(date: Date, now: Date = new Date()): boolean {
  return date.getTime() >= now.getTime() + MIN_SCHEDULE_LEAD_MS;
}

/** Up to four distinct, valid quick picks in chronological order. */
export function buildPresets(now: Date = new Date()): SchedulePreset[] {
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  // Round up to the next quarter hour so it reads as a clean time.
  inOneHour.setSeconds(0, 0);
  inOneHour.setMinutes(Math.ceil(inOneHour.getMinutes() / 15) * 15);

  const candidates: { key: string; label: string; date: Date }[] = [
    { key: "hour", label: "In 1 hour", date: inOneHour },
    { key: "evening", label: "Today", date: atHour(now, 19) },
    { key: "tomorrow-am", label: "Tomorrow", date: atHour(addDays(now, 1), 9) },
    { key: "tomorrow-pm", label: "Tomorrow", date: atHour(addDays(now, 1), 19) },
  ];

  // Next Monday morning (skip when that is simply "tomorrow").
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  if (daysToMonday > 1) candidates.push({ key: "monday", label: "Monday", date: atHour(addDays(now, daysToMonday), 9) });

  const seen = new Set<number>();
  return candidates
    .filter((c) => isFarEnough(c.date, now))
    .filter((c) => {
      const t = c.date.getTime();
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 4)
    .map((c) => ({ ...c, sub: formatTime(c.date) }));
}

/** Pre-filled value so the primary button is never a dead end: tomorrow at 9:00 AM. */
export function defaultSchedule(now: Date = new Date()): Date {
  return atHour(addDays(now, 1), 9);
}
