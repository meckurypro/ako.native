// src/screens/Settings.tsx
// One Settings hub: Profile, Account & security, Privacy, Appearance, Sound, Advanced (one open at a
// time). /settings/profile is the same screen; /settings/appearance and /settings/advanced redirect
// here with the matching section pre-opened.
import { useLocalSearchParams } from "expo-router";
import { Camera, LogOut, ShieldCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/ui/Avatar";
import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { AppUpdateCard } from "@/components/settings/AppUpdateCard";
import { AdvancedSection } from "@/components/settings/AdvancedSection";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { NotificationsSection } from "@/components/settings/NotificationsSection";
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

export type SettingsSectionId = "profile" | "security" | "privacy" | "notifications" | "appearance" | "sound" | "advanced";
const SECTION_IDS: SettingsSectionId[] = ["profile", "security", "privacy", "notifications", "appearance", "sound", "advanced"];

function asSectionId(value: string | string[] | undefined): SettingsSectionId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (SECTION_IDS as string[]).includes(raw) ? (raw as SettingsSectionId) : null;
}

export function Settings() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { data: profile, isLoading: profileLoading } = useOwnProfile();
  // A photo picked from the hero is uploaded by ProfileSection (which saves it with the rest of the profile).
  const [photoRequest, setPhotoRequest] = useState(0);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null);
  const signOut = useSignOut();
  const params = useLocalSearchParams<{ section?: string }>();

  // Every section — Profile included — starts collapsed; a ?section= param can open one (deep links from elsewhere).
  const [openSection, setOpenSection] = useState<SettingsSectionId | null>(asSectionId(params.section) ?? null);
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
    <KeyboardAvoider className="flex-1 bg-canvas">
      <ScreenHeader title="Settings" />
      <ScrollView showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 40 }}>
        {/* Hero — just the avatar, centred, with the round change-photo badge. Name, handle and follower / visit
            stats live on the profile itself; repeating them here was redundant. */}
        <View className="mb-6 items-center">
          <View className="relative">
            <View className="rounded-full border-2 border-border p-[3px]">
              <Avatar src={pendingAvatarUrl ?? profile?.avatar_url} name={profile?.display_name ?? "?"} size="2xl" />
            </View>
            <Pressable
              onPress={() => {
                setOpenSection("profile");
                setPhotoRequest((n) => n + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              className="absolute -bottom-1 -right-1 h-9 w-9 items-center justify-center rounded-full border-[3px] border-canvas bg-cta"
            >
              <Icon as={Camera} size={16} className="text-white" />
            </Pressable>
          </View>
        </View>

        <View className="gap-3">
          {/* Android-only, sideloaded-only, and only when the admin has published a newer APK. */}
          <AppUpdateCard />
          <ProfileSection open={openSection === "profile"} onToggle={() => toggle("profile")} photoRequest={photoRequest} onAvatarChange={setPendingAvatarUrl} />
          <SecuritySection open={openSection === "security"} onToggle={() => toggle("security")} />
          <PrivacySection open={openSection === "privacy"} onToggle={() => toggle("privacy")} />
          <NotificationsSection open={openSection === "notifications"} onToggle={() => toggle("notifications")} />
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
    </KeyboardAvoider>
  );
}
