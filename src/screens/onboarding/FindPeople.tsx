// src/screens/onboarding/FindPeople.tsx
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { Wordmark } from "@/components/ui/Wordmark";
import { useOnboardingRecommendations, type OnboardingRecommendation } from "@/hooks/useOnboarding";
import { useIsFollowing, useToggleFollow } from "@/hooks/useProfile";
import { useTheme } from "@/theme/ThemeProvider";

const MAX_SUGGESTIONS = 5;

function SuggestedPersonRow({
  person,
  onToggled,
}: {
  person: OnboardingRecommendation;
  /** Reports each follow/unfollow so the footer can show a running count. */
  onToggled: (wasFollowing: boolean) => void;
}) {
  const { colors } = useTheme();
  const isFollowingQuery = useIsFollowing(person.id);
  const toggleFollow = useToggleFollow(person.id);
  const isFollowing = !!isFollowingQuery.data;

  return (
    <View
      className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
      style={{
        shadowColor: `rgb(${colors.shadowInkRgb})`,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 1,
      }}
    >
      <Avatar src={person.avatar_url} name={person.display_name} size="md" />

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="shrink font-display text-sm text-ink">
            {person.display_name}
          </Text>
          {person.is_admin_suggested ? (
            <View className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5">
              <Text className="text-[10px] font-medium text-accent">Featured</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} className="mt-0.5 text-xs text-ink-muted">
          @{person.username}
          {person.follower_count > 0 && ` · ${person.follower_count.toLocaleString()} followers`}
        </Text>

        {person.bio ? (
          <Text numberOfLines={1} className="mt-1 text-xs text-ink-muted">
            {person.bio}
          </Text>
        ) : null}

        {person.shared_interest_count > 0 ? (
          <Text className="mt-1 text-[11px] font-medium text-accent">
            {person.shared_interest_count} shared interest{person.shared_interest_count > 1 ? "s" : ""}
          </Text>
        ) : null}
      </View>

      <Button
        variant={isFollowing ? "secondary" : "primary"}
        size="sm"
        onPress={() => {
          onToggled(isFollowing);
          toggleFollow.mutate(isFollowing);
        }}
        disabled={isFollowingQuery.isLoading}
        loading={toggleFollow.isPending}
        className="shrink-0"
      >
        {isFollowing ? "Following" : "Follow"}
      </Button>
    </View>
  );
}

export function FindPeople() {
  const { data: recommendations, isLoading, error, refetch } = useOnboardingRecommendations(MAX_SUGGESTIONS);
  const [followedCount, setFollowedCount] = useState(0);

  return (
    <OnboardingScreen
      footer={
        <View className="items-end">
          <View className="w-48">
            <Button onPress={() => router.push("/onboarding/building")}>
              {followedCount > 0 ? `Continue · ${followedCount} following` : "Continue"}
            </Button>
          </View>
        </View>
      }
    >
      <View className="mb-8">
        <Wordmark />
      </View>

      <Text className="mb-2 font-display text-2xl text-ink">Find your people</Text>
      <Text className="mb-8 text-ink-muted">
        A short, hand-picked list based on what you're interested in — people you might enjoy reasoning with.
      </Text>

      {isLoading ? (
        <Text className="py-16 text-center text-ink-muted">Finding people for you…</Text>
      ) : error ? (
        <View className="items-center py-16">
          <Text className="mb-4 text-danger">Couldn't load suggestions.</Text>
          <Button size="sm" variant="secondary" onPress={() => refetch()}>
            Try again
          </Button>
        </View>
      ) : !recommendations || recommendations.length === 0 ? (
        <Text className="py-16 text-center text-sm text-ink-muted">
          We couldn't find anyone to suggest just yet — you can always find people to follow from Discover once you're in.
        </Text>
      ) : (
        <View className="gap-3">
          {recommendations.slice(0, MAX_SUGGESTIONS).map((person) => (
            <SuggestedPersonRow
              key={person.id}
              person={person}
              onToggled={(wasFollowing) => setFollowedCount((n) => Math.max(0, n + (wasFollowing ? -1 : 1)))}
            />
          ))}
        </View>
      )}
    </OnboardingScreen>
  );
}
