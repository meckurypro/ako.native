// src/components/room/JoinGate.tsx
// Shown to someone who isn't in the room yet. Open communities: one tap. Free public rooms: a request the
// host reviews. Paid rooms: bought from the project page. Private rooms: invitation-only.
import { router, type Href } from "expo-router";
import { Lock, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useCancelRoomJoinRequest, useGroupPublicInfo, useJoinOpenRoom, useMyRoomJoinRequest, useRequestRoomJoin } from "@/hooks/useRoom";

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

interface JoinGateProps {
  projectId: string;
  title: string;
  isPrivate: boolean;
  isFree: boolean;
}

export function JoinGate({ projectId, title, isPrivate, isFree }: JoinGateProps) {
  const toast = useToast();
  const { data: info } = useGroupPublicInfo(projectId);
  const { data: myRequest } = useMyRoomJoinRequest(projectId);
  const requestJoin = useRequestRoomJoin(projectId);
  const cancelRequest = useCancelRoomJoinRequest(projectId);
  const joinOpen = useJoinOpenRoom(projectId);
  const status = myRequest?.status;
  const isOpen = info?.kind === "community" && info?.join_mode === "open";

  if (isPrivate) {
    return (
      <View className="mt-16 items-center gap-3 px-6">
        <Icon as={Lock} size={28} className="text-ink-muted" />
        <Text className="font-medium text-ink">Private room</Text>
        <Text className="text-center text-sm text-ink-muted">“{title}” is invitation-only. The host adds the people who can join.</Text>
      </View>
    );
  }

  if (!isFree) {
    return (
      <View className="mt-16 items-center gap-3 px-6">
        <Icon as={Lock} size={28} className="text-ink-muted" />
        <Text className="font-medium text-ink">Members only</Text>
        <Text className="text-center text-sm text-ink-muted">Buy access to “{title}” from its project page to join this room.</Text>
        <Pressable onPress={() => router.push(`/projects/${projectId}` as Href)} accessibilityRole="link" hitSlop={8} className="mt-2">
          <Text className="text-sm font-medium text-accent">Go to project page</Text>
        </Pressable>
      </View>
    );
  }

  if (isOpen) {
    return (
      <View className="mt-16 items-center gap-3 px-6">
        <Icon as={Users} size={28} className="text-ink-muted" />
        <Text className="font-medium text-ink">{title}</Text>
        <Pressable
          onPress={() => joinOpen.mutate(undefined, { onError: (err) => toast(errorMessage(err, "Couldn't join."), { variant: "error" }) })}
          disabled={joinOpen.isPending}
          accessibilityRole="button"
          className={`mt-2 rounded-full bg-cta px-5 py-2 ${joinOpen.isPending ? "opacity-50" : ""}`}
        >
          <Text className="text-sm font-medium text-white">Join</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mt-16 items-center gap-3 px-6">
      <Icon as={Users} size={28} className="text-ink-muted" />
      <Text className="font-medium text-ink">{title}</Text>
      {status === "pending" ? (
        <>
          <Text className="text-center text-sm text-ink-muted">Your request is waiting for a host to review it.</Text>
          <Pressable onPress={() => cancelRequest.mutate(undefined, { onSuccess: () => toast("Request cancelled.", { variant: "success" }) })} disabled={cancelRequest.isPending} accessibilityRole="button" hitSlop={8} className="mt-2">
            <Text className="text-sm font-medium text-ink-muted">Cancel request</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text className="text-center text-sm text-ink-muted">{status === "declined" ? "Your last request wasn't accepted. You can ask again." : "A host reviews every request to join this room."}</Text>
          <Pressable
            onPress={() =>
              requestJoin.mutate(undefined, {
                onSuccess: () => toast("Request sent.", { variant: "success" }),
                onError: (err) => toast(errorMessage(err, "Couldn't send your request."), { variant: "error" }),
              })
            }
            disabled={requestJoin.isPending}
            accessibilityRole="button"
            className={`mt-2 rounded-full bg-cta px-5 py-2 ${requestJoin.isPending ? "opacity-50" : ""}`}
          >
            <Text className="text-sm font-medium text-white">{status === "declined" ? "Ask again" : "Request to join"}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
