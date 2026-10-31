// src/lib/messageKinds.ts
// What kind of message something is in a group chat, who may send which kind, and the shapes the server returns for
// private answers and private replies. The rules themselves are enforced in the database (messages_kind_rules, see
// supabase/ako_message_kinds.sql); this file only mirrors them so the composer can offer what will actually be accepted.
//
// This file is identical in the web and native apps — keep it free of platform imports.
import type { GroupKind } from "./groups";

export type MessageKind = "question" | "answer" | "lecture" | "announcement";
export type MessageVisibility = "public" | "private";

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
  question: "Question",
  answer: "Answer",
  lecture: "Lecture",
  announcement: "Announcement",
};

export const MESSAGE_KIND_PLURAL: Record<MessageKind, string> = {
  question: "Questions",
  answer: "Answers",
  lecture: "Lectures",
  announcement: "Announcements",
};

export function isMessageKind(value: unknown): value is MessageKind {
  return value === "question" || value === "answer" || value === "lecture" || value === "announcement";
}

/** What a person can choose to send as in a group. `null` in `kinds` is a plain message (community chat only). */
export interface ComposerKinds {
  kinds: (MessageKind | null)[];
  defaultKind: MessageKind | null;
}

/**
 * Cohort: everything is typed. Participants ask and answer; instructors also post lectures and announcements.
 * Community: chat stays plain; hosts may also post an announcement. Anyone else gets no picker at all (returns null).
 */
export function composerKinds(roomKind: GroupKind, isHost: boolean): ComposerKinds | null {
  if (roomKind === "cohort") {
    return {
      kinds: isHost ? ["question", "answer", "lecture", "announcement"] : ["question", "answer"],
      defaultKind: "question",
    };
  }
  return isHost ? { kinds: [null, "announcement"], defaultKind: null } : null;
}

/** Kinds that go out to everyone and shouldn't be one tap from a mistake: the composer resets to the default after sending. */
export function isBroadcastKind(kind: MessageKind | null): boolean {
  return kind === "announcement" || kind === "lecture";
}

/** The part of a message the composer decides; `privateTo` and `privateReplyContext` are only for the optimistic bubble. */
export interface MessageMeta {
  messageKind?: MessageKind | null;
  visibility?: MessageVisibility;
  /** Id of a group message this DM message answers privately ("Reply privately"). */
  privateReplyToMessageId?: string | null;
  privateTo?: string | null;
  privateReplyContext?: PrivateReplyContext | null;
}

/** Only what the server needs on insert. It decides the rest (audience, quote) itself and ignores anything forged. */
export function metaInsertFields(meta?: MessageMeta): {
  message_kind?: MessageKind;
  visibility?: "private";
  private_reply_to_message_id?: string;
} {
  const fields: { message_kind?: MessageKind; visibility?: "private"; private_reply_to_message_id?: string } = {};
  if (meta?.messageKind) fields.message_kind = meta.messageKind;
  if (meta?.visibility === "private") fields.visibility = "private";
  if (meta?.privateReplyToMessageId) fields.private_reply_to_message_id = meta.privateReplyToMessageId;
  return fields;
}

/** Columns every message query selects, so a row always carries its kind and audience. */
export const MESSAGE_META_COLUMNS = "message_kind, visibility, private_to, private_reply_context";

export function metaOptimisticFields(meta?: MessageMeta): {
  message_kind: MessageKind | null;
  visibility: MessageVisibility;
  private_to: string | null;
  private_reply_context: PrivateReplyContext | null;
} {
  return {
    message_kind: meta?.messageKind ?? null,
    visibility: meta?.visibility ?? "public",
    private_to: meta?.privateTo ?? null,
    private_reply_context: meta?.privateReplyContext ?? null,
  };
}

/** The quote a private reply carries. Built by the server from the real message; this is just its shape. */
export interface PrivateReplyContext {
  message_id: string;
  conversation_id: string;
  project_id: string | null;
  group_title: string;
  sender_id: string;
  sender_name: string;
  message_kind: MessageKind | null;
  preview: string;
}

export function parsePrivateReplyContext(raw: unknown): PrivateReplyContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.message_id !== "string" || typeof r.sender_id !== "string") return null;
  return {
    message_id: r.message_id,
    conversation_id: typeof r.conversation_id === "string" ? r.conversation_id : "",
    project_id: typeof r.project_id === "string" ? r.project_id : null,
    group_title: typeof r.group_title === "string" && r.group_title ? r.group_title : "a group",
    sender_id: r.sender_id,
    sender_name: typeof r.sender_name === "string" && r.sender_name ? r.sender_name : "Someone",
    message_kind: isMessageKind(r.message_kind) ? r.message_kind : null,
    preview: typeof r.preview === "string" ? r.preview : "",
  };
}

interface AudienceFields {
  message_kind?: MessageKind | null;
  visibility?: MessageVisibility;
  private_to?: string | null;
}

/** An answer only its asker, its author and the group's hosts can read. */
export function isPrivateAnswer(m: AudienceFields): boolean {
  return m.visibility === "private";
}

/** A private answer the asker opened to the group — it keeps `private_to`, which is how the bubble can say so. */
export function isSharedAnswer(m: AudienceFields): boolean {
  return m.message_kind === "answer" && m.visibility !== "private" && !!m.private_to;
}

/** Plain-English audience line for a private answer, from the viewer's side. */
export function privateAudienceLabel(args: { viewerId: string | undefined; senderId: string; privateTo: string | null; askerName: string }): string {
  const { viewerId, senderId, privateTo, askerName } = args;
  if (viewerId && viewerId === privateTo) return "Private answer to you";
  if (viewerId && viewerId === senderId) return `Private. Only ${askerName} and instructors can see this`;
  return `Private answer to ${askerName}`;
}
