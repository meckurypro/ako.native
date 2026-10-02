// src/lib/calendar.ts
// Builds a standalone .ics file and opens the system share sheet so the user
// can add it to Google Calendar, Apple Calendar or Outlook — no backend, API
// key or calendar permission needed (every calendar app imports .ics). The web
// build triggered a browser download; native writes to the cache and shares.
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
