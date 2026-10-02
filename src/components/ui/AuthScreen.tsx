// src/components/ui/AuthScreen.tsx
// Shared frame for every signed-out screen: the mudcloth AuthPattern behind a
// centred, max-w-sm column. Handles the keyboard (so fields never hide under
// it) and tap-outside-to-dismiss, which a native form needs and a web page
// gets for free.
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthPattern } from "./AuthPattern";

export function AuthScreen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 overflow-hidden bg-canvas">
      <AuthPattern />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          }}
        >
          <View className="w-full max-w-sm self-center">{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
