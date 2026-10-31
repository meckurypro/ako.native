// File: supabase/functions/send-message-push/index.ts
// Two callers, one function:
//   1. A DB trigger (AFTER INSERT on `messages` → dispatch_message_push() → invoke_push_function())
//      posts { message_id } with the shared secret in `x-webhook-secret`. This is the authoritative
//      path: it fires for every message no matter which client (native, web) inserted it.
//   2. The native app's outbox (lib/pushNotify.ts → notifyMessagePush), with the sender's JWT. Kept as
//      a harmless fallback; the `message_push_log` claim below makes sure a message is pushed once.
// verify_jwt is OFF for this function: it authenticates itself (secret OR the sender's JWT).
//
// The push body is the start of the message itself (see preview.ts), like WhatsApp: text is clipped,
// photos/documents/voice notes are summarised in words. Messages are stored as plain text today; if
// end-to-end encryption is switched on, the server can no longer read them and this must go back to a
// fixed "Sent you a message" body (or the device must decrypt in a notification extension).
// The Android channel is created with lockscreenVisibility PRIVATE, so a locked phone that hides
// sensitive notification content hides this text too.
//
// categoryId "message" gives the notification its Reply / Mark as read buttons; the buttons are defined
// and handled on the device (src/lib/pushActions.ts). data.type / conversationId drive tap routing.
//
// Android: the channel id below MUST match src/lib/notificationChannels.ts in the native app.
// Android channels are immutable once created on a device, which is why the ids carry a version
// suffix. A device that doesn't have the channel falls back to the app's default channel.
// Sound is the phone's own notification sound ("default") — no custom audio file.
//
// Muting: a person who muted a group (Connect, project_list_prefs.muted_at) gets no push for that group's chat.
//
// Group message kinds: an announcement is labelled in the push body, and a private answer (visibility "private")
// is only pushed to the people who can read it — the body carries the answer's text, so that filter is what keeps it private.
import { createClient } from "jsr:@supabase/supabase-js@2";

import { pushPreview } from "./preview.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100; // Expo's documented max per request
const CHANNEL_MESSAGES = "messages_v2";
const CATEGORY_MESSAGE = "message"; // MUST match MESSAGE_CATEGORY in src/lib/pushActions.ts

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

type ExpoTicket = { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let claimedMessageId: string | null = null;
  try {
    const { message_id } = await req.json();
    if (!message_id || typeof message_id !== "string") {
      return new Response(JSON.stringify({ error: "message_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Auth: the DB trigger's shared secret, or else the message sender's own JWT.
    const webhookSecret = req.headers.get("x-webhook-secret");
    let callerId: string | null = null;
    if (webhookSecret) {
      const { data: authorised, error: secretError } = await admin.rpc("verify_push_webhook_secret", { p_secret: webhookSecret });
      if (secretError || authorised !== true) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      callerId = user.id;
    }

    const { data: message, error: messageError } = await admin
      .from("messages")
      .select("id, conversation_id, sender_id, content, is_deleted, visibility, message_kind")
      .eq("id", message_id)
      .single();
    if (messageError || !message) {
      return new Response(JSON.stringify({ error: "Message not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // A JWT caller must be the message's own sender — this endpoint only ever notifies *about* a
    // message the caller just sent, never lets a client trigger a push for a message it doesn't own.
    if (callerId && message.sender_id !== callerId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (message.is_deleted) return new Response(JSON.stringify({ sent: 0, reason: "message deleted" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Claim the push: trigger and client both call this function, the first one wins.
    const { error: claimError } = await admin.from("message_push_log").insert({ message_id: message.id });
    if (claimError) {
      if (claimError.code === "23505") return new Response(JSON.stringify({ sent: 0, reason: "already pushed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw claimError;
    }
    claimedMessageId = message.id;

    const [{ data: sender }, { data: participants, error: participantsError }] = await Promise.all([
      admin.from("profiles").select("display_name, username").eq("id", message.sender_id).single(),
      admin
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", message.conversation_id)
        .neq("user_id", message.sender_id)
        .is("left_at", null),
    ]);
    if (participantsError) throw participantsError;

    let recipientIds = (participants ?? []).map((p) => p.user_id);
    // A private answer in a cohort is only for its asker (and the cohort's instructors): nobody else gets a push,
    // and the push body carries the answer's text, so this filter is what keeps it private.
    if (message.visibility === "private") {
      const { data: audience, error: audienceError } = await admin.rpc("message_audience_user_ids", { p_message_id: message.id });
      if (audienceError) throw audienceError;
      const allowed = new Set((audience ?? []) as string[]);
      recipientIds = recipientIds.filter((id) => allowed.has(id));
    }
    if (!recipientIds.length) return new Response(JSON.stringify({ sent: 0, reason: "no recipients" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // A group's chat belongs to a project (project_room_details.conversation_id). Anyone who muted that group is skipped.
    const { data: roomDetails } = await admin
      .from("project_room_details")
      .select("project_id")
      .eq("conversation_id", message.conversation_id)
      .maybeSingle();
    const mutedGroupQuery = roomDetails?.project_id
      ? admin.from("project_list_prefs").select("user_id").eq("project_id", roomDetails.project_id).not("muted_at", "is", null).in("user_id", recipientIds)
      : Promise.resolve({ data: [] as { user_id: string }[] });

    const [{ data: blocks }, { data: mutes }, { data: groupMutes }, { data: tokenRows }] = await Promise.all([
      admin.from("blocked_users").select("blocker_id").eq("blocked_id", message.sender_id).in("blocker_id", recipientIds),
      admin.from("muted_users").select("muter_id").eq("muted_id", message.sender_id).in("muter_id", recipientIds),
      mutedGroupQuery,
      admin.from("push_tokens").select("id, token, user_id").in("user_id", recipientIds),
    ]);

    const suppressed = new Set([
      ...(blocks ?? []).map((b) => b.blocker_id),
      ...(mutes ?? []).map((m) => m.muter_id),
      ...(groupMutes ?? []).map((m) => m.user_id),
    ]);
    const targets = (tokenRows ?? []).filter((row) => !suppressed.has(row.user_id));
    if (!targets.length) return new Response(JSON.stringify({ sent: 0, reason: "no eligible tokens" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const senderName = sender?.display_name || sender?.username || "Someone";
    const body = `${message.message_kind === "announcement" ? "Announcement: " : ""}${pushPreview(message.content)}`;

    const notifications = targets.map((t) => ({
      to: t.token,
      title: senderName,
      body,
      sound: "default", // the phone's own notification sound (Android: set by the channel; iOS: this field)
      priority: "high", // wake a dozing device and allow a heads-up banner
      channelId: CHANNEL_MESSAGES,
      categoryId: CATEGORY_MESSAGE, // Reply / Mark as read buttons
      data: { type: "message", conversationId: message.conversation_id, messageId: message.id },
    }));

    const tickets: ExpoTicket[] = [];
    for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
      const batch = notifications.slice(i, i + BATCH_SIZE);
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
      const parsed = await response.json().catch(() => null);
      if (Array.isArray(parsed?.data)) tickets.push(...(parsed.data as ExpoTicket[]));
      else console.error("send-message-push: unexpected Expo response", response.status, parsed);
    }

    // Tokens Expo already knows are dead are pruned now; every accepted ticket is stored so
    // check-push-receipts can read its receipt later. Any OTHER ticket error (InvalidCredentials = no
    // FCM key uploaded to EAS, MessageRateExceeded, ...) is logged loudly — it used to vanish silently.
    const deadTokenIds: string[] = [];
    const pendingTickets: { ticket_id: string; token: string }[] = [];
    const ticketErrors: Record<string, number> = {};
    tickets.forEach((ticket, index) => {
      const target = targets[index];
      if (!target) return;
      if (ticket.status === "error") {
        const reason = ticket.details?.error ?? "unknown";
        if (reason === "DeviceNotRegistered") deadTokenIds.push(target.id);
        else ticketErrors[reason] = (ticketErrors[reason] ?? 0) + 1;
      } else if (ticket.status === "ok" && ticket.id) pendingTickets.push({ ticket_id: ticket.id, token: target.token });
    });
    if (Object.keys(ticketErrors).length) console.error("send-message-push: Expo ticket errors", ticketErrors);
    if (deadTokenIds.length) await admin.from("push_tokens").delete().in("id", deadTokenIds);
    if (pendingTickets.length) await admin.from("push_tickets").upsert(pendingTickets, { onConflict: "ticket_id", ignoreDuplicates: true });

    return new Response(JSON.stringify({ sent: targets.length, accepted: pendingTickets.length, pruned: deadTokenIds.length, errors: ticketErrors }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("send-message-push error:", error);
    // Release the claim so a retry (the client outbox) can still push this message.
    if (claimedMessageId) {
      try { await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!).from("message_push_log").delete().eq("message_id", claimedMessageId); } catch (_) { /* best effort */ }
    }
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
