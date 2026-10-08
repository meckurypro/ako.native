// src/components/settings/ProfileSection.tsx
// Edit profile: photo, display name, username (live availability check), bio, website, job/hobby tags.
import { Camera, Check, Eye, UserCircle2, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

import { MentionTextarea } from "@/components/post/MentionTextarea";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useOwnProfile } from "@/hooks/useOwnProfile";
import { useUpdateProfile, useUpdateProfileRoles } from "@/hooks/useProfile";
import { useProfileVisitCount } from "@/hooks/useProfileVisits";
import { useRoles } from "@/hooks/useRoles";
import { useUploadAvatar } from "@/hooks/useUploadAvatar";
import { haptics } from "@/lib/haptics";
import { pickSingleImage } from "@/lib/pickImage";
import { supabase } from "@/lib/supabase";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "error";
const USERNAME_DEBOUNCE_MS = 400;
const MAX_ROLES = 3;

interface ProfileSectionProps {
  open: boolean;
  onToggle: () => void;
}

export function ProfileSection({ open, onToggle }: ProfileSectionProps) {
  const { user } = useAuth();
  const { data: profile } = useOwnProfile();
  const { data: visitCount } = useProfileVisitCount(profile?.id, !!profile?.id);
  const updateProfile = useUpdateProfile();
  const updateProfileRoles = useUpdateProfileRoles();
  const uploadAvatar = useUploadAvatar();
  const { data: roles } = useRoles();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const usernameCheckId = useRef(0);

  // Load the saved values once the profile arrives (and again after a save refetches it).
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setUsername(profile.username ?? "");
    setBio(profile.bio ?? "");
    setWebsiteUrl(profile.website_url ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
    const sorted = [...(profile.profile_roles ?? [])].sort((a: any, b: any) => a.position - b.position);
    setRoleIds(sorted.map((r: any) => r.role.id));
  }, [profile]);

  // Debounced username availability check.
  useEffect(() => {
    if (!profile) return;
    const normalized = username.trim().toLowerCase();
    if (normalized === profile.username.toLowerCase() || normalized.length < 3) {
      setUsernameStatus("idle");
      return;
    }
    const checkId = ++usernameCheckId.current;
    setUsernameStatus("checking");
    const timeout = setTimeout(async () => {
      const { data, error } = await supabase.from("profiles").select("id").eq("username", normalized).neq("id", user!.id).maybeSingle();
      if (checkId !== usernameCheckId.current) return; // a newer keystroke superseded this check
      setUsernameStatus(error ? "error" : data ? "taken" : "available");
    }, USERNAME_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [username, profile, user]);

  function toggleRole(id: string) {
    haptics.selection();
    setRoleIds((prev) => {
      if (prev.includes(id)) return prev.filter((r) => r !== id);
      if (prev.length >= MAX_ROLES) return prev; // cap, ignore further taps
      return [...prev, id];
    });
  }

  async function handleChangePhoto() {
    setUploadError(null);
    try {
      const file = await pickSingleImage({ aspect: [1, 1] });
      if (!file) return;
      setAvatarUrl(await uploadAvatar.mutateAsync(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  async function handleSave() {
    setProfileError(null);
    setProfileSaved(false);

    const normalizedUsername = username.trim().toLowerCase();
    const usernameChanged = !!profile && normalizedUsername !== profile.username.toLowerCase();

    if (!displayName.trim()) {
      setProfileError("Display name can't be empty.");
      return;
    }

    if (usernameChanged) {
      if (normalizedUsername.length < 3) {
        setProfileError("Username must be at least 3 characters.");
        return;
      }
      if (usernameStatus === "taken") {
        setProfileError("That username is already taken.");
        return;
      }
      if (usernameStatus === "checking" || usernameStatus === "error") {
        setProfileError("Still checking that username — try again in a moment.");
        return;
      }
      // Re-check right before saving: the debounced result could be stale.
      const { data: existing, error: recheckError } = await supabase.from("profiles").select("id").eq("username", normalizedUsername).neq("id", user!.id).maybeSingle();
      if (recheckError) {
        setProfileError("Couldn't verify that username right now. Please try again.");
        return;
      }
      if (existing) {
        setUsernameStatus("taken");
        setProfileError("That username is already taken.");
        return;
      }
    }

    try {
      await Promise.all([
        updateProfile.mutateAsync({
          display_name: displayName,
          bio,
          website_url: websiteUrl,
          avatar_url: avatarUrl,
          ...(usernameChanged ? { username: normalizedUsername } : {}),
        }),
        updateProfileRoles.mutateAsync(roleIds),
      ]);
      setProfileSaved(true);
      haptics.success();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Couldn't save changes.");
    }
  }

  const usernameError = usernameStatus === "taken" ? "That username is already taken." : usernameStatus === "error" ? "Couldn't check that username. Try again." : undefined;

  return (
    <SettingsSection icon={<Icon as={UserCircle2} size={18} className="text-ink-muted" />} title="Profile" summary={displayName || undefined} open={open} onToggle={onToggle}>
      <View className="mb-6 mt-3 items-center">
        <Pressable onPress={handleChangePhoto} disabled={uploadAvatar.isPending} accessibilityRole="button" accessibilityLabel="Change photo" className="relative">
          <Avatar src={avatarUrl} name={displayName || "?"} size="lg" />
          <View className="absolute bottom-0 right-0 rounded-full bg-accent p-1.5">
            <Icon as={Camera} size={14} className="text-canvas" />
          </View>
        </Pressable>
        <Pressable onPress={handleChangePhoto} disabled={uploadAvatar.isPending} accessibilityRole="button" className="mt-2" hitSlop={8}>
          <Text className="text-sm font-medium text-accent">{uploadAvatar.isPending ? "Uploading…" : "Change photo"}</Text>
        </Pressable>
        {uploadError ? <Text className="mt-1 text-sm text-danger">{uploadError}</Text> : null}

        <View className="mt-3 flex-row items-center gap-1.5" accessibilityLabel="Only visible to you">
          <Icon as={Eye} size={14} className="text-ink-muted" />
          <Text className="text-sm text-ink-muted">
            <Text className="font-medium text-ink">{visitCount ?? 0}</Text> visits in the last 30 days
          </Text>
        </View>
      </View>

      <FormField label="Display name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" textContentType="name" />

      <FormField
        label="Username"
        value={username}
        onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="username"
        error={usernameError}
        leading={<Text className="pb-3 pr-1 pt-1 text-base text-ink-muted">@</Text>}
        trailing={
          <View className="pb-3 pl-2">
            {usernameStatus === "checking" && <ActivityIndicator size="small" />}
            {usernameStatus === "available" && <Icon as={Check} size={16} className="text-accent" />}
            {(usernameStatus === "taken" || usernameStatus === "error") && <Icon as={X} size={16} className="text-danger" />}
          </View>
        }
      />
      {usernameStatus === "checking" && <Text className="-mt-4 mb-6 text-xs text-ink-muted">Checking availability…</Text>}
      {usernameStatus === "available" && <Text className="-mt-4 mb-6 text-xs text-accent">Username is available.</Text>}

      <FormField label="Email" value={user?.email ?? ""} editable={false} selectTextOnFocus={false} style={{ opacity: 0.6 }} />
      <Text className="-mt-4 mb-6 text-xs text-ink-muted">This can't be changed here.</Text>

      <View className="mb-6">
        <Text className="mb-2.5 text-[11px] font-medium uppercase tracking-[1.54px] text-ink-muted">Bio</Text>
        <MentionTextarea value={bio} onChange={setBio} maxLength={280} rows={3} className="rounded-xl border border-border bg-canvas px-4 py-3" />
        <Text className="mt-1 text-xs text-ink-muted">{bio.length}/280</Text>
      </View>

      <FormField label="Website" value={websiteUrl} onChangeText={setWebsiteUrl} placeholder="https://" keyboardType="url" autoCapitalize="none" autoCorrect={false} textContentType="URL" />

      {roles && roles.length > 0 && (
        <View className="mb-6">
          <Text className="mb-2.5 text-[11px] font-medium uppercase tracking-[1.54px] text-ink-muted">
            Job or hobby <Text className="text-ink-muted/70">({roleIds.length}/{MAX_ROLES})</Text>
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {roles.map((role) => {
              const selected = roleIds.includes(role.id);
              const disabled = !selected && roleIds.length >= MAX_ROLES;
              return (
                <Pressable
                  key={role.id}
                  onPress={() => toggleRole(role.id)}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled }}
                  className={`rounded-full border px-3 py-1.5 ${selected ? "border-accent bg-accent" : disabled ? "border-border bg-canvas opacity-50" : "border-border bg-canvas"}`}
                >
                  <Text className={`text-sm ${selected ? "text-canvas" : disabled ? "text-ink-muted" : "text-ink"}`}>{role.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {profileError ? (
        <Text className="mb-4 text-sm text-danger" accessibilityRole="alert">
          {profileError}
        </Text>
      ) : null}
      {profileSaved ? <Text className="mb-4 text-sm text-accent">Profile updated.</Text> : null}

      <Button onPress={handleSave} loading={updateProfile.isPending || updateProfileRoles.isPending}>
        Save changes
      </Button>
    </SettingsSection>
  );
}
