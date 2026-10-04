// src/screens/FollowRequests.tsx
import { router, type Href } from "expo-router";
import { FlatList, Pressable, View } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { Avatar } from "@/components/ui/Avatar";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useAcceptFollowRequest, useDeclineFollowRequest, useIncomingFollowRequests } from "@/hooks/useFollowRequests";

function shortAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function FollowRequests() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { data: requests, isLoading } = useIncomingFollowRequests();
  const accept = useAcceptFollowRequest();
  const decline = useDeclineFollowRequest();

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Follow requests" bar />
      {isLoading ? (
        <Text className="py-10 text-center text-ink-muted">Loading…</Text>
      ) : !requests || requests.length === 0 ? (
        <Text className="py-10 text-center text-sm text-ink-muted">No pending requests.</Text>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
          renderItem={({ item: req }) => {
            const pending = (accept.isPending && accept.variables?.id === req.id) || (decline.isPending && decline.variables?.id === req.id);
            const open = () => router.push(`/profile/${req.requester.username}` as Href);
            return (
              <View className="flex-row items-center gap-3 border-b border-border py-3.5">
                <Pressable onPress={open} accessibilityRole="link" className="shrink-0">
                  <Avatar src={req.requester.avatar_url} name={req.requester.display_name} />
                </Pressable>
                <Pressable onPress={open} accessibilityRole="link" className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-medium text-ink">
                    {req.requester.display_name}
                  </Text>
                  <Text numberOfLines={1} className="text-sm text-ink-muted">
                    @{req.requester.username} · {shortAgo(req.created_at)}
                  </Text>
                </Pressable>
                <View className="shrink-0 flex-row items-center gap-2">
                  <Pressable
                    onPress={() => decline.mutate({ id: req.id, requesterId: req.requester.id })}
                    disabled={pending}
                    accessibilityRole="button"
                    className={`rounded-full border border-border px-3.5 py-1.5 ${pending ? "opacity-40" : ""}`}
                  >
                    <Text className="text-sm text-ink-muted">Decline</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => accept.mutate({ id: req.id, requesterId: req.requester.id })}
                    disabled={pending}
                    accessibilityRole="button"
                    className={`rounded-full bg-accent px-3.5 py-1.5 ${pending ? "opacity-40" : ""}`}
                  >
                    <Text className="text-sm font-medium text-canvas">Accept</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
