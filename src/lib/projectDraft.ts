// src/lib/projectDraft.ts
//
// A person's half-filled "New project" form, kept on this phone so leaving the screen doesn't cost them their work.
//
// Why local, and not a `status = 'draft'` row in `projects` (which is how Courses and authored Books already
// start): the type-specific parts of a project — an event's date/location, a meeting's time, media sources, a gig's
// role, a file or link, a book's source — are validated by database constraints on insert and are NOT editable
// from EditProject afterwards (it only patches title/description/price/status/topics). A half-filled form saved
// as a server draft would be rejected by those constraints for most types, and when it wasn't, could never be
// completed. So the form is stored as-is and restored the next time they open New project.
//
// Stored in AsyncStorage (not lib/secureDb's kv_cache: that is an explicitly best-effort cache that is wiped on
// sign-out and silently skips writes when the encrypted DB is unavailable — wrong for work the person was just told
// is saved). One draft per account per acting identity (personal / each Page), keyed by user id so another account
// on the same phone never sees it. Uploaded files/images are already in storage — only their URLs are kept here.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { EMPTY_BOOK_FIELDS, type BookFieldsValue } from "@/components/project-types/BookFields";
import { EMPTY_EVENT_FIELDS, type EventFieldsValue } from "@/components/project-types/EventFields";
import { fileFieldsHaveProgress, normalizeFileFields, type FileFieldsValue } from "@/components/project-types/FileFields";
import { EMPTY_GIG_FIELDS, type GigFieldsValue } from "@/components/project-types/GigFields";
import { EMPTY_MEDIA_FIELDS, type MediaFieldsValue } from "@/components/project-types/MediaFields";
import { EMPTY_MEETING_FIELDS, type MeetingFieldsValue } from "@/components/project-types/MeetingFields";
import { EMPTY_PITCH_FIELDS, type PitchFieldsValue } from "@/components/project-types/PitchFields";
import { EMPTY_ROOM_FIELDS, type RoomFieldsValue } from "@/components/project-types/RoomFields";
import { EMPTY_URL_FIELDS, type UrlFieldsValue } from "@/components/project-types/UrlFields";
import type { ProjectType } from "@/hooks/useProjects";

const VERSION = 1;

export interface ProjectDraftData {
  title: string;
  description: string;
  projectType: ProjectType;
  topicIds: string[];
  priceUsd: string;
  showPromo: boolean;
  promoPriceUsd: string;
  isPrivate: boolean;
  thumbnailUrl: string | null;
  thumbnailRatio: { width: number; height: number } | null;
  supportingImageUrls: string[];
  fileFields: FileFieldsValue;
  urlFields: UrlFieldsValue;
  mediaFields: MediaFieldsValue;
  eventFields: EventFieldsValue;
  meetingFields: MeetingFieldsValue;
  gigFields: GigFieldsValue;
  pitchFields: PitchFieldsValue;
  roomFields: RoomFieldsValue;
  bookFields: BookFieldsValue;
}

interface StoredDraft {
  v: number;
  savedAt: number;
  data: ProjectDraftData;
}

export function projectDraftKey(userId: string, pageId?: string | null): string {
  return `ako:project-draft:v${VERSION}:${userId}:${pageId ?? "me"}`;
}

export async function readProjectDraft(key: string): Promise<{ data: ProjectDraftData; savedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || parsed.v !== VERSION || !parsed.data || typeof parsed.data.title !== "string") return null;
    // A draft saved before File projects could hold several files stored one { file_path, file_name }.
    return { data: { ...parsed.data, fileFields: normalizeFileFields(parsed.data.fileFields) }, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/** false when the write failed (storage full / unavailable) — the caller must tell the person. */
export async function writeProjectDraft(key: string, data: ProjectDraftData): Promise<boolean> {
  try {
    const stored: StoredDraft = { v: VERSION, savedAt: Date.now(), data };
    await AsyncStorage.setItem(key, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export async function clearProjectDraft(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}

/** Two drafts with the same signature are the same form. Used to tell "restored and untouched" from "edited". */
export function projectDraftSignature(d: ProjectDraftData): string {
  return JSON.stringify(d);
}

const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

/**
 * Has the person actually put something in? Deliberately NOT "differs from the initial state": the form changes
 * some values on its own (it corrects the type to one the account may create, and resets the price of a book that
 * isn't their own work), and that must never count as unsaved progress.
 */
export function projectDraftHasProgress(d: ProjectDraftData): boolean {
  return (
    d.title.trim() !== "" ||
    d.description.trim() !== "" ||
    d.thumbnailUrl !== null ||
    d.supportingImageUrls.length > 0 ||
    d.topicIds.length > 0 ||
    d.priceUsd !== "0" ||
    d.promoPriceUsd.trim() !== "" ||
    d.isPrivate ||
    fileFieldsHaveProgress(d.fileFields) ||
    differs(d.urlFields, EMPTY_URL_FIELDS) ||
    differs(d.mediaFields, EMPTY_MEDIA_FIELDS) ||
    differs(d.eventFields, EMPTY_EVENT_FIELDS) ||
    differs(d.meetingFields, EMPTY_MEETING_FIELDS) ||
    differs(d.gigFields, EMPTY_GIG_FIELDS) ||
    differs(d.pitchFields, EMPTY_PITCH_FIELDS) ||
    differs(d.roomFields, EMPTY_ROOM_FIELDS) ||
    differs(d.bookFields, EMPTY_BOOK_FIELDS)
  );
}
