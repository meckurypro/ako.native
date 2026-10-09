// src/lib/calendar.ts
// Add-to-calendar, least-privilege: the OS's OWN "new event" screen (addToCalendar) — the app never reads or
// writes the calendar itself, so it needs no calendar permission (and the Android READ/WRITE_CALENDAR
// permissions that expo-calendar declares are blocked in app.json). If that screen can't open, fall back to a
// standalone .ics file + the system share sheet, which every calendar app can import (shareIcsEvent).
import { createEventInCalendarAsync } from "expo-calendar/legacy";
import { randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export interface IcsEventInput {
  title: string;
  description?: string;
  location?: string;
  startIso: string;
  durationHours?: number; // default 2
}

export function buildIcs({ title, description, location, startIso, durationHours = 2 }: IcsEventInput): string {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const uid = `${randomUUID()}@ako.app`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ako//Event//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(start.toISOString())}`,
    `DTEND:${toIcsDate(end.toISOString())}`,
    `SUMMARY:${icsEscape(title)}`,
    location ? `LOCATION:${icsEscape(location)}` : null,
    description ? `DESCRIPTION:${icsEscape(description)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter((line): line is string => line !== null)
    .join("\r\n");
}

/** Write the event to a temp .ics file and open the share sheet. */
export async function shareIcsEvent(input: IcsEventInput): Promise<void> {
  const fileName = `${input.title.replace(/[^a-z0-9]/gi, "-").slice(0, 40) || "event"}.ics`;
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(buildIcs(input));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/calendar",
    UTI: "public.calendar-event",
    dialogTitle: "Add to calendar",
  });
}

export type AddToCalendarResult = "saved" | "canceled" | "shared";

/**
 * Opens the system add-event screen pre-filled. "saved"/"canceled" are iOS-only signals — Android doesn't
 * report what the user did there, so it always resolves "saved" (never claim more than we know in the UI).
 */
export async function addToCalendar(input: IcsEventInput): Promise<AddToCalendarResult> {
  const startDate = new Date(input.startIso);
  const endDate = new Date(startDate.getTime() + (input.durationHours ?? 2) * 60 * 60 * 1000);
  try {
    const result = await createEventInCalendarAsync({ title: input.title, notes: input.description, location: input.location, startDate, endDate });
    return result.action === "canceled" ? "canceled" : "saved";
  } catch {
    await shareIcsEvent(input);
    return "shared";
  }
}
