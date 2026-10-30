// src/lib/authMethods.ts
//
// Does this account have a password it can sign in with?
//
//   • Email + password sign-ups: yes ("email" is one of the account's providers).
//   • Google (or any future OAuth) sign-ups: no — there is nothing to "change", and asking for a current password
//     could never succeed. They get "Reset password" instead.
//   • An OAuth account that has gone through Reset password has now set one, so from then on it can change it the
//     normal way. We record that in user_metadata (see PASSWORD_SET_FLAG) when the reset completes, because
//     Supabase doesn't reliably add an "email" provider for it.
//
// This only decides which form to show. The server is still what verifies the current password (signInWithPassword).
import type { User } from "@supabase/supabase-js";

export const PASSWORD_SET_FLAG = "password_set";

export function hasPasswordLogin(user: User | null | undefined): boolean {
  if (!user) return false;
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  const primary = user.app_metadata?.provider as string | undefined;
  if (providers.includes("email") || primary === "email") return true;
  return user.user_metadata?.[PASSWORD_SET_FLAG] === true;
}
