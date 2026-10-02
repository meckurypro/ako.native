// src/lib/formatStats.ts
// Formatting helpers for the stats line shown under an expanded post
// (time · date · views), styled to match X's own post-detail formatting.

// 3-letter month abbreviations, except September — X abbreviates that one
// as "Sept" (4 letters) rather than "Sep", so this matches that quirk
// rather than a plain toLocaleDateString month format.
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sept", "Oct", "Nov", "Dec",
];

/** "22:45" — 24-hour, local time. */
export function formatPostTime(dateString: string): string {
  const d = new Date(dateString);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** "04 Sept 26" — day, month, 2-digit year. */
export function formatPostDate(dateString: string): string {
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}

/** "32.7K" / "1.2M" / "304" — compact notation, same shape as X's view counts. */
export function formatCompactCount(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
