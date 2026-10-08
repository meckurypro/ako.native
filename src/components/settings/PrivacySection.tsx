// src/components/settings/PrivacySection.tsx
// Privacy: private account, hide follower/following lists, blocked and muted accounts.
import { Lock, Shield, UserCircle2, UserX, Users, VolumeX } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { ToggleRow } from "@/components/settings/SettingsParts";
import { Avatar } from "@/components/ui/Avatar";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useOwnProfile } from "@/hooks/useOwnProfile";
import { useBlockedList, useMutedList, useToggleBlock, useToggleHideFollowersList, useToggleHideFollowingList, useToggleMute, useTogglePrivateAccount } from "@/hooks/usePrivacy";

function PersonRow({ avatarUrl, name, actionLabel, pending, onAction }: { avatarUrl: string | null; name: string; actionLabel: string; pending: boolean; onAction: () => void }) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-xl bg-canvas p-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
        <Avatar src={avatarUrl} name={name} size="sm" />
        <Text numberOfLines={1} className="shrink text-sm text-ink">
          {name}
        </Text>
      </View>
      <Pressable onPress={onAction} disabled={pending} accessibilityRole="button" hitSlop={8} className={pending ? "opacity-50" : ""}>
        <Text className="text-sm font-medium text-accent">{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function BlockedRow({ person }: { person: { id: string; display_name: string; avatar_url: string | null } }) {
  const toast = useToast();
  const toggle = useToggleBlock(person.id);
  return <PersonRow avatarUrl={person.avatar_url} name={person.display_name} actionLabel="Unblock" pending={toggle.isPending} onAction={() => toggle.mutate(true, { onError: () => toast("Couldn't unblock. Try again.", { variant: "error" }) })} />;
}

function MutedRow({ person }: { person: { id: string; display_name: string; avatar_url: string | null } }) {
  const toast = useToast();
  const toggle = useToggleMute(person.id);
  return <PersonRow avatarUrl={person.avatar_url} name={person.display_name} actionLabel="Unmute" pending={toggle.isPending} onAction={() => toggle.mutate(true, { onError: () => toast("Couldn't unmute. Try again.", { variant: "error" }) })} />;
}

export function PrivacySection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { data: profile } = useOwnProfile();
  const togglePrivate = useTogglePrivateAccount();
  const toggleHideFollowers = useToggleHideFollowersList();
  const toggleHideFollowing = useToggleHideFollowingList();
  const { data: blocked } = useBlockedList();
  const { data: muted } = useMutedList();
  const failure = "Couldn't update this setting. Try again.";

  return (
    <SettingsSection icon={<Icon as={Shield} size={18} className="text-ink-muted" />} title="Privacy" summary={profile?.is_private ? "Private" : "Public"} open={open} onToggle={onToggle}>
      <View className="mt-3">
        <ToggleRow icon={Lock} title="Private account" description="Only followers can see your posts" checked={!!profile?.is_private} onToggle={() => togglePrivate.mutate(!profile?.is_private)} pending={togglePrivate.isPending} error={togglePrivate.isError ? failure : null} />
        <ToggleRow
          icon={Users}
          title="Hide followers list"
          description="Others won't be able to see who follows you"
          checked={!!profile?.hide_followers_list}
          onToggle={() => toggleHideFollowers.mutate(!profile?.hide_followers_list)}
          pending={toggleHideFollowers.isPending}
          error={toggleHideFollowers.isError ? failure : null}
        />
        <ToggleRow
          icon={UserCircle2}
          title="Hide following list"
          description="Others won't be able to see who you follow"
          checked={!!profile?.hide_following_list}
          onToggle={() => toggleHideFollowing.mutate(!profile?.hide_following_list)}
          pending={toggleHideFollowing.isPending}
          error={toggleHideFollowing.isError ? failure : null}
        />

        <View className="mb-2 mt-5 flex-row items-center gap-1.5">
          <Icon as={UserX} size={14} className="text-ink-muted" />
          <Text className="text-sm font-medium text-ink-muted">Blocked accounts</Text>
        </View>
        <View className="mb-5 gap-2">{!blocked || blocked.length === 0 ? <Text className="text-sm text-ink-muted">No blocked accounts.</Text> : blocked.map((p) => <BlockedRow key={p.id} person={p} />)}</View>

        <View className="mb-2 flex-row items-center gap-1.5">
          <Icon as={VolumeX} size={14} className="text-ink-muted" />
          <Text className="text-sm font-medium text-ink-muted">Muted accounts</Text>
        </View>
        <View className="gap-2">{!muted || muted.length === 0 ? <Text className="text-sm text-ink-muted">No muted accounts.</Text> : muted.map((p) => <MutedRow key={p.id} person={p} />)}</View>
      </View>
    </SettingsSection>
  );
}
