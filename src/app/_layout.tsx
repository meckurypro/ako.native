// File: src/app/_layout.tsx
import "@/lib/polyfills";
import "@/lib/notificationHandler";
import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { router, Stack, useGlobalSearchParams } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { PortalHost } from "@/components/ui/Portal";
import { ToastProvider } from "@/components/ui/Toast";
import {
  storePendingAffiliateClick,
  useClaimPendingAffiliateClick,
  useTrackAffiliateClick,
} from "@/hooks/useAffiliates";
import { AuthProvider } from "@/hooks/useAuth";
import { usePageThemeSync } from "@/hooks/usePageThemeSync";
import { SoundProvider } from "@/hooks/useSound";
import { queryClient } from "@/lib/queryClient";
import { initSecureStorage } from "@/lib/secureStorage";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { fontAssets } from "@/theme/fonts";

SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedStack() {
  const { colors, resolvedTheme } = useTheme();
  return (
    <>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
      <LoadingOverlay />
    </>
  );
}

/**
 * App-wide side effects that need the auth + query providers above them:
 *   • keep the palette in step with the server-confirmed identity (Page mode)
 *   • capture affiliate links — a `?ref=` on any incoming link is tracked once,
 *     stashed for claiming after sign-in, and stripped from the route params
 */
function GlobalEffects() {
  usePageThemeSync();
  useClaimPendingAffiliateClick();

  const { ref } = useGlobalSearchParams<{ ref?: string }>();
  const trackClick = useTrackAffiliateClick();
  const handledTokens = useRef(new Set<string>());

  useEffect(() => {
    if (!ref || handledTokens.current.has(ref)) return;
    handledTokens.current.add(ref);
    trackClick.mutate(ref, {
      onSuccess: (result) => storePendingAffiliateClick(result.click_token),
    });
    router.setParams({ ref: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  return null;
}

function Shell() {
  const { ready } = useTheme();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const appReady = ready && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (appReady) SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

  if (!appReady) return null;
  return (
    <ErrorBoundary>
      <ToastProvider>
        {/* Toasts paint above everything the host layers (sheets 50, modals 60). */}
        <PortalHost>
          <GlobalEffects />
          <ThemedStack />
        </PortalHost>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  // The encryption key (Keychain/Keystore) must be in memory before auth reads the session or the account
  // switcher touches saved sessions. The native splash is still up, so this is invisible.
  const [secureReady, setSecureReady] = useState(false);
  useEffect(() => {
    initSecureStorage()
      .catch((e) => {
        if (__DEV__) console.warn("[secureStorage] init failed", e);
      })
      .finally(() => setSecureReady(true));
  }, []);
  if (!secureReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <SoundProvider>
              <AuthProvider>
                <Shell />
              </AuthProvider>
            </SoundProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
