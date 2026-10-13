// src/lib/timeAgo.ts
// "just now" / "5m ago" / "3h ago" / "2d ago" / "3w ago" / "2m ago" (months) / "1y ago".
// Days switch to weeks above 14, months above 31, years above 366.
export function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days > 366) return `${Math.floor(days / 365)}y ago`;
  if (days > 31) return `${Math.floor(days / 30)}m ago`;
  if (days > 14) return `${Math.floor(days / 7)}w ago`;
  return `${days}d ago`;
}
