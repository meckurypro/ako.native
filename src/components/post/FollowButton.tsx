// src/components/post/FollowButton.tsx
// Small follow pill shown on post headers. Reads as a status once established
// (Following / Friends / Requested), with a brief pop when it first arrives.
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { Text } from "@/components/ui/Text";
import { useTheme } from "@/theme/ThemeProvider";
import { useHasPendingFollowRequest, useSendFollowRequest } from "@/hooks/useFollowRequests";
import { useCanFollow } from "@/hooks/useAccountAccess";
import { useIsFollowedByUser, useIsFollowingAsActiveIdentity, useToggleFollowAsActiveIdentity } from "@/hooks/useProfile";

interface FollowButtonProps {
  authorId: string;
  isPrivate: boolean;
}

// Same pill as the web badge: text-[11px] font-semibold, px-2.5 py-1, rounded-full,
// bg-ink/10. The fill is built from the live theme colour (hex + alpha) and every
// layout value is an inline style: Reanimated's Animated.View does not run
// className through NativeWind, which is why the badge used to render as bare text.
const PILL = { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" } as const;

function StatusPill({ label, pop }: { label: string; pop: boolean }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (pop) {
      scale.value = withSequence(withTiming(1.05, { duration: 110, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 150 }));
    }
  }, [pop, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[PILL, { backgroundColor: `${colors.ink}1A` }, style]}>
      <Text className="text-[11px] font-semibold leading-[14px] text-ink">{label}</Text>
    </Animated.View>
  );
}

export function FollowButton({ authorId, isPrivate }: FollowButtonProps) {
  const { colors } = useTheme();
  const isFollowingQuery = useIsFollowingAsActiveIdentity(authorId);
  const isFollowedByUserQuery = useIsFollowedByUser(authorId);
  const hasPendingQuery = useHasPendingFollowRequest(authorId);
  const toggleFollow = useToggleFollowAsActiveIdentity(authorId);
  const sendRequest = useSendFollowRequest(authorId);
  // Accounts still under review can't follow yet (the server rejects it) — don't offer a control that can only fail.
  const canFollow = useCanFollow();

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

  if (loading || !canFollow) return null;

  if (isFollowing) return <StatusPill label={isFollowedByUser ? "Friends" : "Following"} pop={justArrived} />;
  if (hasPendingRequest) return <StatusPill label="Requested" pop={justArrived} />;

  return (
    <Pressable
      onPress={() => (isPrivate ? sendRequest.mutate() : toggleFollow.mutate(false))}
      accessibilityRole="button"
      accessibilityLabel={isFollowedByUser ? "Follow back" : "Follow"}
      hitSlop={6}
      style={[PILL, { backgroundColor: isFollowedByUser ? `${colors.pushback}26` : `${colors.ink}1A` }]}
    >
      <View>
        <Text className={`text-[11px] font-semibold leading-[14px] ${isFollowedByUser ? "text-pushback" : "text-ink"}`}>Follow</Text>
      </View>
    </Pressable>
  );
}
