// src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { updateSavedAccountProfile, updateSavedAccountTokens } from "../lib/accountSessions";
import { authStorageKey, isUnreachableError, parseStoredSession } from "../lib/authOffline";
import { raceWithTimeout } from "../lib/offlineBoot";
import { encryptedAuthStorage } from "../lib/secureStorage";

interface MyProfile {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: MyProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * How long the launch screen waits for supabase-js to restore the session. With an expired access token it must
 * refresh over the network first; on a connected-but-dead network that request hangs (or retries with backoff for
 * ~30 s) and the splash never lifts. Past this, start from the session stored on the device — same fallback as an
 * outright offline start — and let the refresh finish in the background (onAuthStateChange delivers the result).
 */
const SESSION_RESTORE_TIMEOUT_MS = 5000;

async function readStoredSession(): Promise<Session | null> {
  const key = authStorageKey(process.env.EXPO_PUBLIC_SUPABASE_URL ?? "");
  if (!key) return null;
  return parseStoredSession(await encryptedAuthStorage.getItem(key).catch(() => null));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    // Get the current session on load
    (async () => {
      const raced = await raceWithTimeout(supabase.auth.getSession(), SESSION_RESTORE_TIMEOUT_MS);
      // Offline with an access token older than ~1h, getSession() can't refresh and returns null — which would send a
      // signed-in person to a login screen that can't work offline, and make everything saved for offline use
      // unreachable. ONLY when that is because the server couldn't be reached (an unreachable error, or no answer at
      // all within the timeout), keep the session still stored on the device (see lib/authOffline.ts). A
      // revoked/invalid session isn't a network error and still signs out as before; once online, supabase-js
      // refreshes the token itself (or signs out if the server rejects it).
      let effective: Session | null;
      if (raced.timedOut) {
        effective = await readStoredSession();
      } else {
        const {
          data: { session },
          error,
        } = raced.value;
        effective = session;
        if (!effective && isUnreachableError(error)) effective = await readStoredSession();
      }
      if (cancelled) return;
      // `cur ??` so a session the auth listener delivered in the meantime (the late refresh) is never overwritten.
      setSession((cur) => cur ?? effective);
      setLoading(false);
    })();

    // Subscribe to auth changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Fires on SIGNED_IN, TOKEN_REFRESHED, etc. — this is the only
      // reliable point to catch a silent background token refresh and
      // keep the saved-accounts cache from drifting out of sync with it.
      if (session) {
        updateSavedAccountTokens(session.user.id, {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // Session-wide realtime sync. As long as the user is signed in, listen
  // for new notification rows addressed to THEM — the DB triggers
  // (notify_on_message, notify_on_follow) already scope these correctly
  // to the recipient — and push cache updates immediately. This is what
  // makes the bell and the message icon update live anywhere in the app,
  // instead of waiting on the bell's 30s poll or the conversation list's
  // 15s poll, or requiring a specific thread to be open.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Bell badge + list
          queryClient.invalidateQueries({ queryKey: ["notifications", userId] });

          // Message-type notifications also drive the message icon badge
          // and the conversation list/preview.
          if (payload.new.type === "message") {
            queryClient.invalidateQueries({ queryKey: ["conversations", userId] });

            const conversationId = payload.new.target_id as string | undefined;
            if (conversationId) {
              queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, queryClient]);

  // Presence heartbeat — touches profiles.last_seen_at every 45s while
  // signed in, plus immediately on sign-in and whenever the tab regains
  // focus. This is the sole source of truth for the online/recent/
  // offline status dots (see lib/presence.ts) — purely timestamp-based,
  // no separate realtime presence channel.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const touch = () => {
      supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", userId)
        .then(({ error }) => {
          if (error) console.error("Failed to update last_seen_at:", error);
        });
    };

    touch();
    const interval = setInterval(touch, 45_000);

    // Native equivalent of the web's visibilitychange: refresh presence the
    // moment the app returns to the foreground.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") touch();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [session?.user?.id]);

  const userId = session?.user?.id;

  // Own username, fetched once per session and cached — shared with
  // MyProfileRedirect via the same query key, and used by BottomNav
  // to detect "am I viewing my own profile" without going through /me.
  const { data: profile } = useQuery({
    queryKey: ["my-username", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: Infinity,
  });

  // Keep this account's entry in the device's saved-accounts list (the switcher) in step with its live profile.
  useEffect(() => {
    if (!userId || !profile) return;
    updateSavedAccountProfile(userId, {
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    });
  }, [userId, profile?.username, profile?.display_name, profile?.avatar_url]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile: profile ?? null, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
