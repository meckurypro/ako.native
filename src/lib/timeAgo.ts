// src/lib/timeAgo.ts
// "just now" / "5 minutes ago" / "1 hour ago" / "2 days ago" / "1 week ago" /
// "5 months ago" / "6 years ago". Units are spelled out and pluralised.
// Days become weeks at 7, weeks become months at 30 days, months become years at 365 days.
function unit(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"} ago`;
}

export function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return unit(days, "day");
  if (days < 30) return unit(Math.floor(days / 7), "week");
  if (days < 365) return unit(Math.floor(days / 30), "month");
  return unit(Math.floor(days / 365), "year");
}
