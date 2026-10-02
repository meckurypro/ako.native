// File: src/app/_layout.tsx
import "@/lib/polyfills";
import "../global.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { PortalHost } from "@/components/ui/Portal";
import { ToastProvider } from "@/components/ui/Toast";
import { SoundProvider } from "@/hooks/useSound";
import { queryClient } from "@/lib/queryClient";
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
          <ThemedStack />
        </PortalHost>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <SoundProvider>
              <Shell />
            </SoundProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
