// src/lib/verifyPassword.ts
//
// Checks an email + password pair WITHOUT touching the signed-in session. signInWithPassword on the app's own client
// fires SIGNED_IN across the whole app (auth listeners, cache resets, remounts), which wiped the Settings form's
// loading/success state mid-change. A throwaway in-memory client keeps the check invisible to the app.
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL as string, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}
