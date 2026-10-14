// src/hooks/useAccountAccess.ts
//
// Incubation Account Review & Access Gate — the single authoritative
// "can this authenticated user enter Akọ right now?" check, mirrored
// client-side from the DB's fn_can_access_app(uid) (see the
// incubation_review_gate_and_verified_badge migration). This is the
// UX layer only: the real enforcement lives server-side (RLS on
// follows/messages/reactions, and the gate check inside the
// create-post/create-comment edge functions), so even if this hook
// were bypassed entirely, a pending user still can't write.
//
// Reuses the existing feature_flags table/hooks (see
// useFeatureFlags.ts) for the "incubation_review_gate_enabled" toggle
// rather than a second config system, and profiles.account_status
// for the per-account approval state.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { unregisterPushToken } from "../lib/push";
import { wipeSecureCache } from "../lib/secureDb";
import { useAuth } from "./useAuth";

export type AccountStatus = "pending" | "approved" | "declined" | "suspended";

export interface AccountAccess {
  /** Whether the review gate is currently enforced at all. */
  gateEnabled: boolean;
  accountStatus: AccountStatus;
  /**
   * May this user enter the app at all? Approved users, and everyone when
   * the gate is off, always can. A 'pending' user can too — but in
   * restricted (consumer-only) mode, see `restricted`. Declined/suspended
   * accounts stay locked out on the Under Review screen.
   */
  canAccess: boolean;
  /**
   * Consumer-only mode: the gate is enforced and this account is still
   * 'pending'. They get the app minus the Feed and every creation entry
   * point, with NO messaging about being restricted — the UI simply
   * doesn't offer those surfaces. Server-side RLS/edge checks
   * (fn_can_access_feature) are the real enforcement.
   */
  restricted: boolean;
}

export function useAccountAccess() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["account-access", user?.id],
    queryFn: async (): Promise<AccountAccess> => {
      const [{ data: flagRow, error: flagError }, { data: profile, error: profileError }] = await Promise.all([
        supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "incubation_review_gate_enabled")
          .maybeSingle(),
        supabase.from("profiles").select("account_status").eq("id", user!.id).single(),
      ]);

      // Fail CLOSED on a genuine error (network/DB failure) — do not
      // silently grant access just because the check itself broke.
      // A missing flag ROW (flagRow === null, no error) is different:
      // that means the gate has never been configured, which we
      // treat as "not enforced yet" — see the migration's seed row
      // and fn_can_access_app.
      if (flagError) throw flagError;
      if (profileError) throw profileError;

      const gateEnabled = flagRow?.enabled ?? false;
      const accountStatus = (profile?.account_status ?? "approved") as AccountStatus;

      const restricted = gateEnabled && accountStatus === "pending";

      return {
        gateEnabled,
        accountStatus,
        canAccess: gateEnabled ? accountStatus === "approved" || restricted : true,
        restricted,
      };
    },
    enabled: !!user,
    // Short staleTime: an admin approving the account, or flipping the
    // gate, should be reflected soon after — without hammering the
    // DB on every render. RequireAuth also invalidates this on window
    // focus via the default query behavior.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * True while the signed-in user is in restricted (consumer-only) mode.
 * Silent by design: callers just hide/redirect, never explain. Resolves
 * to false until the access query has data (RequireAuth/AuthGate always
 * resolve it before rendering protected screens, so in practice it is
 * already cached by the time any screen reads it).
 */
export function useIsRestricted(): boolean {
  const { data } = useAccountAccess();
  return data?.restricted ?? false;
}

/**
 * Where a restricted user lands instead of the Feed — after login, after
 * onboarding, and when they hit a full-access-only route. Library is the
 * consumer-only home (it holds what they've bought/saved).
 */
export const RESTRICTED_HOME = "/library";

/** Logout from the Under Review screen — same signOut used by Settings. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Detach this device from the account while the session can still satisfy RLS (best-effort, time-boxed).
      await unregisterPushToken();
      await wipeSecureCache(); // cached lists belong to the account that is leaving
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => queryClient.clear(),
  });
}
