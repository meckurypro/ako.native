// src/components/onboarding/OnboardingScreen.tsx
// Shared frame for the onboarding steps: AuthPattern backdrop, a scrollable
// body, and an optional docked footer (the web's `fixed bottom-0` action bar)
// that rides above the keyboard and respects the bottom safe area.
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthPattern } from "@/components/ui/AuthPattern";

interface OnboardingScreenProps {
  children: ReactNode;
  /** Docked bar at the bottom (progress text + Continue button). */
  footer?: ReactNode;
  /** Centre the body vertically (Welcome / Building) instead of top-aligning it. */
  centered?: boolean;
  /** Body column max width in px: 512 (max-w-lg) for lists, 672 (max-w-2xl) for pickers. */
  maxWidth?: number;
}

export function OnboardingScreen({ children, footer, centered = false, maxWidth = 512 }: OnboardingScreenProps) {
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
            justifyContent: centered ? "center" : "flex-start",
            paddingHorizontal: 24,
            paddingTop: insets.top + 24,
            paddingBottom: 24,
          }}
        >
          <View style={{ width: "100%", maxWidth, alignSelf: "center" }}>{children}</View>
        </ScrollView>

        {footer ? (
          <View className="border-t border-border bg-canvas px-6 pt-4" style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
            <View style={{ width: "100%", maxWidth, alignSelf: "center" }}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
