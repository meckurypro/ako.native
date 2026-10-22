// src/hooks/useGiftVault.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { VaultGift } from "../lib/giftVault";

/** Every gift the signed-in user has received, newest first (get_gift_vault RPC). */
export function useGiftVault() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["gift-vault", user?.id],
    queryFn: async (): Promise<VaultGift[]> => {
      const { data, error } = await supabase.rpc("get_gift_vault", { p_limit: 1000 });
      if (error) throw error;
      return ((data ?? []) as VaultGift[]).map((g) => ({ ...g, amount: Number(g.amount) }));
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}
