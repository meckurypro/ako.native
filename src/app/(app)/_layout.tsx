// src/app/(app)/_layout.tsx
// Everything behind sign-in. One AuthGate for the whole group, one persistent
// bottom nav (visibility per route lives in components/nav/routes.ts), and a
// single Stack for navigation. /create presents as a transparent modal over
// whatever screen opened it — the native form of the web's "modal route".
import { BlurTargetView } from "expo-blur";
import { Stack, usePathname } from "expo-router";
import { View } from "react-native";

import { AuthGate } from "@/components/nav/AuthGate";
import { BottomNav } from "@/components/nav/BottomNav";
import { ChromeProvider, useChrome } from "@/components/nav/ChromeProvider";
import { OfflineBanner } from "@/components/nav/OfflineBanner";
import { ScrollToTopButton } from "@/components/nav/ScrollToTopButton";
import { useAuth } from "@/hooks/useAuth";
import { isGuestProjectPath } from "@/lib/guestRoutes";
import { usePersistedQueries } from "@/hooks/usePersistedQueries";
import { usePostRealtime } from "@/hooks/usePostRealtime";
import { usePushLifecycle } from "@/hooks/usePushLifecycle";
import { useRouteMemory } from "@/hooks/useRouteMemory";
import { useTheme } from "@/theme/ThemeProvider";

/** Push registration, tap routing and badge sync — signed-in only, so it lives inside the AuthGate. */
function PushLifecycle() {
  usePushLifecycle();
  return null;
}

/** Remembers the current screen and restores it after the OS kills the backgrounded app — see useRouteMemory. */
function RouteMemory() {
  const { user } = useAuth();
  useRouteMemory(user?.id);
  return null;
}

/** Holds the signed-in shell for the few ms it takes to restore the encrypted offline cache. */
function PersistGate({ children }: { children: React.ReactNode }) {
  const restored = usePersistedQueries();
  usePostRealtime(); // live post edits from other devices / authors
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
          {/* Declared screens sort first, so the first one is what the Stack shows whenever its state is rebuilt
              (e.g. after the shell remounts). It must be a real page, never the Create sheet. */}
          <Stack.Screen name="feed" />
          <Stack.Screen name="create" options={{ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
        </Stack>
      </BlurTargetView>
      <ScrollToTopButton />
      <OfflineBanner />
      <BottomNav />
    </View>
  );
}

/**
 * What a signed-out visitor gets when a shared project link opens the app: just the navigator (no bottom nav, no push,
 * no offline cache). The project screen itself shows the guest view; its actions send them through login and back.
 */
function GuestShell() {
  const { colors } = useTheme();
  return (
    <ChromeProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
    </ChromeProvider>
  );
}

export default function AppLayout() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  // A project link is the one screen that doesn't need an account to look at. Everything else still goes through AuthGate.
  if (!loading && !user && isGuestProjectPath(pathname)) return <GuestShell />;

  return (
    <AuthGate>
      <PersistGate>
        <PushLifecycle />
        <RouteMemory />
        <ChromeProvider>
          <Shell />
        </ChromeProvider>
      </PersistGate>
    </AuthGate>
  );
}
