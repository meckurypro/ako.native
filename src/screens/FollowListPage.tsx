// src/screens/FollowListPage.tsx
import { Lock } from "lucide-react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useFollowers, useFollowing, useProfileByUsername } from "@/hooks/useProfile";

export function FollowListPage({ type }: { type: "followers" | "following" }) {
  const { username } = useLocalSearchParams<{ username: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfileByUsername(username ?? "");

  const isOwnList = !!user && !!profile && user.id === profile.id;
  const hiddenByOwner = type === "followers" ? profile?.hide_followers_list : profile?.hide_following_list;
  const isHidden = !!profile && !isOwnList && hiddenByOwner;

  const followersQuery = useFollowers(!isHidden ? profile?.id ?? "" : "");
  const followingQuery = useFollowing(!isHidden ? profile?.id ?? "" : "");

  const list = type === "followers" ? followersQuery.data : followingQuery.data;
  const isLoading = profileLoading || (!isHidden && (type === "followers" ? followersQuery.isLoading : followingQuery.isLoading));

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={type === "followers" ? "Followers" : "Following"} />
      {isLoading ? (
        <Text className="py-10 text-center text-ink-muted">Loading…</Text>
      ) : isHidden ? (
        <View className="items-center py-14">
          <Icon as={Lock} size={22} className="mb-3 text-ink-muted" />
          <Text className="max-w-[240px] text-center text-sm text-ink-muted">
            @{profile!.username} has chosen to hide their {type} list.
          </Text>
        </View>
      ) : !list || list.length === 0 ? (
        <Text className="py-10 text-center text-sm text-ink-muted">{type === "followers" ? "No followers yet." : "Not following anyone yet."}</Text>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item: person }) => (
            <Pressable
              onPress={() => router.push(`/profile/${person.username}` as Href)}
              accessibilityRole="link"
              className="flex-row items-center gap-3 border-b border-border py-3 active:opacity-70"
            >
              <Avatar src={person.avatar_url} name={person.display_name} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-medium text-ink">
                  {person.display_name}
                </Text>
                <Text numberOfLines={1} className="text-sm text-ink-muted">
                  @{person.username}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
