// src/lib/pushNotify.ts
// Chat pushes are CLIENT-invoked (unlike activity pushes, which a DB trigger sends): after a message
// insert succeeds the sender's app asks send-message-push to notify the other participants. The function
// verifies the caller is the message's sender, so this can only ever announce a message you just sent.
// Fire-and-forget: a failed push must never fail or delay the send.
import { supabase } from "./supabase";

export function notifyMessagePush(messageId: string): void {
  supabase.functions.invoke("send-message-push", { body: { message_id: messageId } }).then(
    ({ error }) => {
      if (error && __DEV__) console.warn("[push] send-message-push failed", error.message);
    },
    () => {}
  );
}
