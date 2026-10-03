// src/components/post/PersonRow.tsx
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { RoleTags } from "@/components/ui/RoleTags";
import { Text } from "@/components/ui/Text";
import { TierBadge } from "@/components/ui/TierBadge";
import type { ProfileWithRoles } from "@/types/database";

export function PersonRow({ profile, onVisit }: { profile: ProfileWithRoles; onVisit?: (profileId: string) => void }) {
  return (
    <Pressable
      onPress={() => {
        onVisit?.(profile.id);
        router.push(`/profile/${profile.username}` as Href);
      }}
      accessibilityRole="link"
      className="min-h-[56px] flex-row items-center gap-3 py-3 active:opacity-70"
    >
      <Avatar src={profile.avatar_url} name={profile.display_name} />
      <View className="min-w-0 flex-1">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text className="text-sm font-medium text-ink">{profile.display_name}</Text>
          <TierBadge tier={profile.tier} />
        </View>
        {profile.roles?.length > 0 ? <RoleTags roles={profile.roles} className="text-xs text-ink-muted" /> : null}
        <Text className="mt-0.5 text-xs text-ink-muted">@{profile.username}</Text>
      </View>
      {profile.follower_count > 0 ? (
        <Text className="shrink-0 text-xs text-ink-muted">{profile.follower_count.toLocaleString()} followers</Text>
      ) : null}
    </Pressable>
  );
}
