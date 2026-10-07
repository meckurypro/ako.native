// src/lib/dateInput.ts
// The web forms kept dates as <input type="datetime-local"> strings
// ("2026-10-07T14:30", local time, no zone). Every submit handler then does
// new Date(value).toISOString(). The native forms keep the SAME string shape —
// so that downstream code is unchanged — and convert to/from Date for the picker.
function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function dateToLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "" → null; otherwise a Date in local time. */
export function localInputToDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
