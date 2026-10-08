// src/screens/Settings.tsx
// One Settings hub: Profile, Account & security, Privacy, Appearance, Sound, Advanced (one open at a
// time). /settings/profile is the same screen; /settings/appearance and /settings/advanced redirect
// here with the matching section pre-opened.
import { useLocalSearchParams } from "expo-router";
import { LogOut, ShieldCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { PrivacySection } from "@/components/settings/PrivacySection";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { SecuritySection } from "@/components/settings/SecuritySection";
import { SoundSection } from "@/components/settings/SoundSection";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useSignOut } from "@/hooks/useAccountAccess";
import { useIsAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/hooks/useAuth";
import { useOwnProfile } from "@/hooks/useOwnProfile";
import { removeSavedAccount } from "@/lib/accountSessions";
import { APP_URL } from "@/lib/config";

export type SettingsSectionId = "profile" | "security" | "privacy" | "appearance" | "sound" | "advanced";
const SECTION_IDS: SettingsSectionId[] = ["profile", "security", "privacy", "appearance", "sound", "advanced"];

function asSectionId(value: string | string[] | undefined): SettingsSectionId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (SECTION_IDS as string[]).includes(raw) ? (raw as SettingsSectionId) : null;
}

export function Settings() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { isLoading: profileLoading } = useOwnProfile();
  const signOut = useSignOut();
  const params = useLocalSearchParams<{ section?: string }>();

  // Profile is open by default (the section people open most); a ?section= param can open another.
  const [openSection, setOpenSection] = useState<SettingsSectionId | null>(asSectionId(params.section) ?? "profile");
  useEffect(() => {
    const requested = asSectionId(params.section);
    if (requested) setOpenSection(requested);
  }, [params.section]);

  const toggle = (id: SettingsSectionId) => setOpenSection((current) => (current === id ? null : id));

  function handleLogout() {
    if (user) removeSavedAccount(user.id);
    // Signing out drops the session; the auth gate sends the app back to the login screen.
    signOut.mutate();
  }

  if (profileLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScreenHeader title="Settings" />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 40 }}>
        <View className="gap-3">
          <ProfileSection open={openSection === "profile"} onToggle={() => toggle("profile")} />
          <SecuritySection open={openSection === "security"} onToggle={() => toggle("security")} />
          <PrivacySection open={openSection === "privacy"} onToggle={() => toggle("privacy")} />
          <AppearanceSection open={openSection === "appearance"} onToggle={() => toggle("appearance")} />
          <SoundSection open={openSection === "sound"} onToggle={() => toggle("sound")} />
          <AdvancedSection open={openSection === "advanced"} onToggle={() => toggle("advanced")} />
        </View>

        {/* Admin tools live on the web, not in the app. */}
        {isAdmin && APP_URL ? (
          <Pressable onPress={() => void Linking.openURL(`${APP_URL}/admin`)} accessibilityRole="link" className="mx-auto mt-8 flex-row items-center justify-center gap-2" hitSlop={8}>
            <Icon as={ShieldCheck} size={16} className="text-accent" />
            <Text className="text-sm font-medium text-accent">Admin (opens in browser)</Text>
          </Pressable>
        ) : null}

        <Pressable onPress={handleLogout} disabled={signOut.isPending} accessibilityRole="button" className={`mx-auto flex-row items-center justify-center gap-2 ${isAdmin && APP_URL ? "mt-4" : "mt-8"} ${signOut.isPending ? "opacity-50" : ""}`} hitSlop={8}>
          <Icon as={LogOut} size={16} className="text-ink-muted" />
          <Text className="text-sm text-ink-muted">{signOut.isPending ? "Logging out…" : "Log out"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
