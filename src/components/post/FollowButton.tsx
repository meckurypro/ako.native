// src/components/post/FollowButton.tsx
// Small follow pill shown on post headers. Reads as a status once established
// (Following / Friends / Requested), with a brief pop when it first arrives.
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { Text } from "@/components/ui/Text";
import { useHasPendingFollowRequest, useSendFollowRequest } from "@/hooks/useFollowRequests";
import { useIsFollowedByUser, useIsFollowingAsActiveIdentity, useToggleFollowAsActiveIdentity } from "@/hooks/useProfile";

interface FollowButtonProps {
  authorId: string;
  isPrivate: boolean;
}

function StatusPill({ label, pop }: { label: string; pop: boolean }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (pop) {
      scale.value = withSequence(withTiming(1.12, { duration: 120, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 160 }));
    }
  }, [pop, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style} className="rounded-full bg-ink/10 px-2.5 py-1">
      <Text className="text-[11px] font-semibold text-ink">{label}</Text>
    </Animated.View>
  );
}

export function FollowButton({ authorId, isPrivate }: FollowButtonProps) {
  const isFollowingQuery = useIsFollowingAsActiveIdentity(authorId);
  const isFollowedByUserQuery = useIsFollowedByUser(authorId);
  const hasPendingQuery = useHasPendingFollowRequest(authorId);
  const toggleFollow = useToggleFollowAsActiveIdentity(authorId);
  const sendRequest = useSendFollowRequest(authorId);

  const isFollowing = !!isFollowingQuery.data;
  const isFollowedByUser = !!isFollowedByUserQuery.data;
  const hasPendingRequest = !!hasPendingQuery.data;
  const loading = isFollowingQuery.isLoading || isFollowedByUserQuery.isLoading || hasPendingQuery.isLoading;

  // Only pop on a false→true change we witnessed, never on first render.
  const [justArrived, setJustArrived] = useState(false);
  const prevEstablished = useRef<boolean | null>(null);
  useEffect(() => {
    if (loading) return;
    const established = isFollowing || hasPendingRequest;
    if (prevEstablished.current !== null && established && !prevEstablished.current) {
      setJustArrived(true);
      const timer = setTimeout(() => setJustArrived(false), 280);
      prevEstablished.current = established;
      return () => clearTimeout(timer);
    }
    prevEstablished.current = established;
  }, [loading, isFollowing, hasPendingRequest]);

  if (loading) return null;

  if (isFollowing) return <StatusPill label={isFollowedByUser ? "Friends" : "Following"} pop={justArrived} />;
  if (hasPendingRequest) return <StatusPill label="Requested" pop={justArrived} />;

  const disabled = toggleFollow.isPending || sendRequest.isPending;

  return (
    <Pressable
      onPress={() => (isPrivate ? sendRequest.mutate() : toggleFollow.mutate(false))}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={isFollowedByUser ? "Follow back" : "Follow"}
      hitSlop={6}
      className={`rounded-full px-2.5 py-1 ${isFollowedByUser ? "bg-pushback/15" : "bg-ink/10"} ${disabled ? "opacity-50" : ""}`}
    >
      <View>
        <Text className={`text-[11px] font-semibold ${isFollowedByUser ? "text-pushback" : "text-ink"}`}>Follow</Text>
      </View>
    </Pressable>
  );
}
