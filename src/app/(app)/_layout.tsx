// src/app/(app)/_layout.tsx
// Everything behind sign-in. One AuthGate for the whole group, one persistent
// bottom nav (visibility per route lives in components/nav/routes.ts), and a
// single Stack for navigation. /create presents as a transparent modal over
// whatever screen opened it — the native form of the web's "modal route".
import { BlurTargetView } from "expo-blur";
import { Stack } from "expo-router";
import { View } from "react-native";

import { AuthGate } from "@/components/nav/AuthGate";
import { BottomNav } from "@/components/nav/BottomNav";
import { ChromeProvider, useChrome } from "@/components/nav/ChromeProvider";
import { usePersistedQueries } from "@/hooks/usePersistedQueries";
import { usePushLifecycle } from "@/hooks/usePushLifecycle";
import { useTheme } from "@/theme/ThemeProvider";

/** Push registration, tap routing and badge sync — signed-in only, so it lives inside the AuthGate. */
function PushLifecycle() {
  usePushLifecycle();
  return null;
}

/** Holds the signed-in shell for the few ms it takes to restore the encrypted offline cache. */
function PersistGate({ children }: { children: React.ReactNode }) {
  const restored = usePersistedQueries();
  return restored ? <>{children}</> : <View style={{ flex: 1 }} />;
}

/** Screens live inside the blur target so the bottom nav can frost whatever scrolls beneath it (Android; plain View on iOS). */
function Shell() {
  const { colors } = useTheme();
  const { blurTarget } = useChrome();
  return (
    <View style={{ flex: 1 }}>
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
          <Stack.Screen name="create" options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
        </Stack>
      </BlurTargetView>
      <BottomNav />
    </View>
  );
}

export default function AppLayout() {
  return (
    <AuthGate>
      <PersistGate>
        <PushLifecycle />
        <ChromeProvider>
          <Shell />
        </ChromeProvider>
      </PersistGate>
    </AuthGate>
  );
}
