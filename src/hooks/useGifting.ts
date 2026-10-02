// src/hooks/useGifting.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useSound } from "./useSound";
import { useAuth } from "./useAuth";

interface SendGiftInput {
  recipient_id: string;
  gift_type_id: string;
  post_id?: string;
  comment_id?: string;
}

export function useSendGift() {
  const queryClient = useQueryClient();
  const { play } = useSound();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: SendGiftInput) => {
      const { data, error } = await supabase.functions.invoke("process-gift", {
        body: input,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data.gift;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      // Keeps GiftPicker's "top 6 used" grid ordering fresh right after
      // a send, so a newly-frequent gift can move up on next open.
      queryClient.invalidateQueries({ queryKey: ["top-gift-types"] });
      play("gift-sent");
    },
  });
}

interface SendMediaGiftInput {
  project_id: string;
  gift_type_id: string;
}

// Gifting a Media project instead of a post/comment — there's no
// single recipient to name up front (see process_media_gift): the
// net amount splits immediately across the project's accepted
// collaborators (by their split_percent) plus the owner for the
// remainder, each crediting its own wallet and notification. The RPC
// itself re-checks auth.uid() and the gifting feature flag, so this
// is a thin client-side wrapper, same trust boundary as calling
// process_gift by RPC.
export function useSendMediaGift() {
  const queryClient = useQueryClient();
  const { play } = useSound();
  const { user } = useAuth();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: SendMediaGiftInput) => {
      if (!user) throw new Error("Sign in to send a gift.");
      const { data, error } = await supabase.rpc("process_media_gift", {
        p_sender_id: user.id,
        p_project_id: input.project_id,
        p_gift_type_id: input.gift_type_id,
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["top-gift-types"] });
      play("gift-sent");
    },
  });
}
