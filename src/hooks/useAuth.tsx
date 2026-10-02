// src/hooks/useAuth.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { updateSavedAccountTokens } from "../lib/accountSessions";

interface MyProfile {
  username: string;
  avatar_url: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: MyProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Get the current session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

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

    return () => subscription.unsubscribe();
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
        .select("username, avatar_url")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: Infinity,
  });

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
