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
  return <ThemedStack />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Shell />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
