// src/hooks/useSendMedia.ts
// Sends photos (one, or an album of up to 10) and documents into a 1:1 chat.
// Same shape as useSendVoiceNote: the bubble appears instantly from the local file
// (optimistic message), the real upload + insert happen in the background, and the
// optimistic row is swapped for the real one. Files go to the private "chat-media"
// bucket under `<uid>/dm/<conversationId>/…` — the first segment must be the uploader's
// own id and the conversation id lets the other participant read it back (see
// supabase/ako_chat_media_bucket.sql in the web repo).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import * as ImageManipulator from "expo-image-manipulator";

import {
  CHAT_MEDIA_BUCKET,
  MAX_ALBUM_ITEMS,
  MAX_MEDIA_BYTES,
  chatFileName,
  encodeMedia,
  safeStorageName,
  type MediaItem,
  type MediaKind,
} from "../lib/chatMedia";
import { fileExtension, type LocalFile } from "../lib/localFile";
import { supabase } from "../lib/supabase";
import { notifyMessagePush } from "../lib/pushNotify";
import { uploadLocalFile } from "../lib/storageUpload";
import { useAuth } from "./useAuth";
import { getMessagesQueries, type MessageWithSender } from "./useMessaging";

interface ReplySnippet {
  id: string;
  content: string;
  sender_id: string;
  is_deleted: boolean;
}

export interface SendMediaInput {
  kind: MediaKind;
  files: LocalFile[];
  caption?: string;
  /** Send photos at higher quality (WhatsApp's "HD"). */
  hd?: boolean;
  replyToMessageId?: string | null;
  replyToSnippet?: ReplySnippet | null;
}

const STANDARD = { maxEdge: 1600, quality: 0.8 };
const HD = { maxEdge: 2560, quality: 0.92 };

/** Shrinks a photo like chat apps do before upload — big originals are the #1 reason sends feel slow. */
async function compressImage(file: LocalFile, hd: boolean): Promise<LocalFile> {
  const { maxEdge, quality } = hd ? HD : STANDARD;
  try {
    const ctx = ImageManipulator.ImageManipulator.manipulate(file.uri);
    const w = file.width ?? 0;
    const h = file.height ?? 0;
    if (w > maxEdge || h > maxEdge) {
      ctx.resize(w >= h ? { width: maxEdge } : { height: maxEdge });
    }
    const rendered = await ctx.renderAsync();
    const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: quality });
    return { uri: saved.uri, name: file.name, type: "image/jpeg", size: file.size, width: saved.width, height: saved.height };
  } catch {
    return file; // the original is still a perfectly good upload
  }
}

export function useSendMedia(conversationId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ kind, files, caption, hd = false, replyToMessageId }: SendMediaInput) => {
      if (!user) throw new Error("Not signed in");
      if (!files.length) throw new Error("No files");
      if (files.length > MAX_ALBUM_ITEMS) throw new Error("too_many");
      if (files.some((f) => f.size > MAX_MEDIA_BYTES)) throw new Error("too_large");

      const now = new Date();
      const prepared = await Promise.all(
        files.map(async (f, i) => {
          if (kind === "image") {
            const small = await compressImage(f, hd);
            const name = chatFileName("IMG", "jpg", i, now);
            return { file: { ...small, name }, name };
          }
          return { file: f, name: f.name || chatFileName("DOC", fileExtension(f), i, now) };
        })
      );

      const items: MediaItem[] = await Promise.all(
        prepared.map(async ({ file, name }, i) => {
          const path = `${user.id}/dm/${conversationId}/${Date.now()}-${i}-${safeStorageName(name)}`;
          await uploadLocalFile(CHAT_MEDIA_BUCKET, path, file);
          return { kind, path, name, mime: file.type, size: file.size, width: file.width, height: file.height };
        })
      );

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: encodeMedia({ items, caption: caption?.trim() || undefined }),
          reply_to_message_id: replyToMessageId ?? null,
        })
        .select("id, conversation_id, sender_id, content, created_at, delivered_at, read_at, reply_to_message_id, is_deleted")
        .single();
      if (error) throw error;
      notifyMessagePush(data.id);

      // Replying with media accepts a pending message request, same as sending text.
      const { error: acceptError } = await supabase
        .from("conversation_participants")
        .update({ is_request: false, archived_at: null })
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id)
        .eq("is_request", true);
      if (acceptError) console.error("Failed to accept message request:", acceptError);

      return data;
    },
    onMutate: async ({ kind, files, caption, replyToMessageId, replyToSnippet }) => {
      await queryClient.cancelQueries({ queryKey: ["messages", conversationId], exact: false });
      const previousQueries = getMessagesQueries(queryClient, conversationId);
      const tempId = randomUUID();

      const optimistic: MessageWithSender = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user!.id,
        content: encodeMedia({
          items: files.map((f) => ({ kind, url: f.uri, name: f.name, mime: f.type, size: f.size, width: f.width, height: f.height })),
          caption: caption?.trim() || undefined,
        }),
        created_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        reply_to_message_id: replyToMessageId ?? null,
        is_deleted: false,
        reply_to: replyToSnippet ? [replyToSnippet] : null,
        client_key: tempId,
      };
      for (const [key, existing] of previousQueries) {
        queryClient.setQueryData(key, [...(existing ?? []), optimistic]);
      }
      return { previousQueries, tempId };
    },
    onError: (_err, _input, context) => {
      if (!context) return;
      for (const [key, data] of context.previousQueries) queryClient.setQueryData(key, data);
    },
    onSuccess: (data, _input, context) => {
      if (context?.tempId) {
        for (const [key, existing] of getMessagesQueries(queryClient, conversationId)) {
          if (!existing) continue;
          queryClient.setQueryData(
            key,
            existing.map((m) =>
              m.id === context.tempId ? { ...(data as MessageWithSender), reply_to: m.reply_to, client_key: context.tempId } : m
            )
          );
        }
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["archived-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["my-participant-state", conversationId] });
    },
  });
}
