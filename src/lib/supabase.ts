// File: src/lib/supabase.ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

// Expo inlines EXPO_PUBLIC_* at build time (the native equivalent of the web
// app's import.meta.env.VITE_*). Only the anon key ever ships in the client —
// RLS policies are what actually enforce access control.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Copy .env.example to .env and fill in your project values."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session on native; OAuth/magic links are handled through
    // expo-linking deep links instead.
    detectSessionInUrl: false,
  },
});

// Supabase's timers don't run while the app is backgrounded, so tell the
// client to stop/start token refresh with the app's lifecycle.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
