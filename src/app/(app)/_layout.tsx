// src/app/(app)/_layout.tsx
// Everything behind sign-in. One AuthGate for the whole group, one persistent
// bottom nav (visibility per route lives in components/nav/routes.ts), and a
// single Stack for navigation. /create presents as a native modal over
// whatever screen opened it — the native form of the web's "modal route".
import { Stack } from "expo-router";
import { View } from "react-native";

import { AuthGate } from "@/components/nav/AuthGate";
import { BottomNav } from "@/components/nav/BottomNav";
import { ChromeProvider } from "@/components/nav/ChromeProvider";
import { useTheme } from "@/theme/ThemeProvider";

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <AuthGate>
      <ChromeProvider>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
            <Stack.Screen name="create" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          </Stack>
          <BottomNav />
        </View>
      </ChromeProvider>
    </AuthGate>
  );
}
