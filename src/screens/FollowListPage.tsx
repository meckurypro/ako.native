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
import { useFollowers, useFollowing, useFollowingPages, useProfileByUsername } from "@/hooks/useProfile";
import { PageRow } from "@/components/post/PageRow";
import type { PageSearchResult } from "@/hooks/useSearch";
import type { Profile } from "@/types/database";

type FollowItem = { kind: "person"; person: Profile } | { kind: "page"; page: PageSearchResult };

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

  // Pages someone follows live in page_follows; list them after the people.
  const pagesQuery = useFollowingPages(!isHidden && type === "following" ? profile?.id ?? "" : "");

  const people = type === "followers" ? followersQuery.data : followingQuery.data;
  const list: FollowItem[] | undefined = people
    ? [
        ...people.map((person): FollowItem => ({ kind: "person", person })),
        ...(type === "following" ? (pagesQuery.data ?? []).map((page): FollowItem => ({ kind: "page", page })) : []),
      ]
    : undefined;
  const isLoading =
    profileLoading ||
    (!isHidden && (type === "followers" ? followersQuery.isLoading : followingQuery.isLoading || pagesQuery.isLoading));

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
          keyExtractor={(item) => (item.kind === "person" ? `p-${item.person.id}` : `g-${item.page.id}`)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) =>
            item.kind === "page" ? (
              <View className="border-b border-border">
                <PageRow page={item.page} />
              </View>
            ) : (
            <Pressable
              onPress={() => router.push(`/profile/${item.person.username}` as Href)}
              accessibilityRole="link"
              className="flex-row items-center gap-3 border-b border-border py-3 active:opacity-70"
            >
              <Avatar src={item.person.avatar_url} name={item.person.display_name} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-medium text-ink">
                  {item.person.display_name}
                </Text>
                <Text numberOfLines={1} className="text-sm text-ink-muted">
                  @{item.person.username}
                </Text>
              </View>
            </Pressable>
            )
          }
        />
      )}
    </View>
  );
}
