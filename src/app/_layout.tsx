// File: src/app/_layout.tsx
import "@/lib/polyfills";
import "@/lib/notificationHandler";
import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { router, Stack, useGlobalSearchParams } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppSplash } from "@/components/AppSplash";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { PortalHost } from "@/components/ui/Portal";
import { SystemNavigationBar } from "@/components/ui/SystemNavigationBar";
import { ToastProvider } from "@/components/ui/Toast";
import {
  storePendingAffiliateClick,
  useClaimPendingAffiliateClick,
  useTrackAffiliateClick,
} from "@/hooks/useAffiliates";
import { useAccountAccess } from "@/hooks/useAccountAccess";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { usePageThemeSync } from "@/hooks/usePageThemeSync";
import { SoundProvider } from "@/hooks/useSound";
import { queryClient } from "@/lib/queryClient";
import { initSecureStorage } from "@/lib/secureStorage";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { fontAssets } from "@/theme/fonts";

SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedStack() {
  const { colors, resolvedTheme } = useTheme();
  // The window's own background sits behind every system bar and shows through any gap (keyboard, overscroll,
  // screen transitions) — keep it on the app canvas so those never flash a different colour.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.canvas).catch(() => {});
  }, [colors.canvas]);
  return (
    <>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      {/* Android system nav bar: transparent (plugin in app.json) with theme-matched buttons. See the component. */}
      <SystemNavigationBar style={resolvedTheme === "dark" ? "light" : "dark"} />
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
  const { ready, colors } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const access = useAccountAccess();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const appReady = ready && (fontsLoaded || !!fontError);
  const [showSplash, setShowSplash] = useState(true);

  // The native splash (background-only) stays up until the first frame of this tree — AppSplash included — has
  // laid out, so the branded splash is already on screen when it goes. Hiding it any earlier would flash the app.
  const onLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  if (!appReady) return null;

  // The branded splash lifts once the session is restored and, for a signed-in user, the account-access check has
  // answered — so the first thing revealed is the real landing screen, not a spinner.
  const splashReady = !authLoading && !(!!user && access.isLoading);

  return (
    <View onLayout={onLayout} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <ErrorBoundary>
        <ToastProvider>
          {/* Toasts paint above everything the host layers (sheets 50, modals 60). */}
          <PortalHost>
            <GlobalEffects />
            <ThemedStack />
            <UpdatePrompt />
          </PortalHost>
        </ToastProvider>
      </ErrorBoundary>
      {showSplash && <AppSplash ready={splashReady} onFinished={() => setShowSplash(false)} />}
    </View>
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
