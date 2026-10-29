// src/components/room/JoinGate.tsx
// The group's landing page — what anyone sees before they're in: the group itself, who it's for, and the one way in that applies to it.
//   private → invitation only · paid → buy access · open community → join · everything else → ask a host.
import { router, usePathname, type Href } from "expo-router";
import { ArrowLeft, Calendar, Lock, Users } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/friendlyError";
import { formatUsd } from "@/lib/money";
import { GROUP_KIND_LABEL, type GroupKind } from "@/lib/groups";
import { useSmartBack } from "@/hooks/useSmartBack";
import { usePurchaseProject, type Project } from "@/hooks/useProjects";
import {
  invalidateRoomMembership,
  useCancelRoomJoinRequest,
  useJoinOpenRoom,
  useMyRoomJoinRequest,
  useRequestRoomJoin,
  type GroupPublicInfo,
} from "@/hooks/useRoom";

const fmt = (v: string) => new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function JoinGate({ project, info, isGuest }: { project: Project; info: GroupPublicInfo | null | undefined; isGuest: boolean }) {
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();
  const pathname = usePathname();
  const toast = useToast();
  const queryClient = useQueryClient();
  const projectId = project.id;
  const { data: myRequest } = useMyRoomJoinRequest(projectId);
  const requestJoin = useRequestRoomJoin(projectId);
  const cancelRequest = useCancelRoomJoinRequest(projectId);
  const joinOpen = useJoinOpenRoom(projectId);
  const purchase = usePurchaseProject();

  const kind: GroupKind = info?.kind ?? "community";
  const price = Number(project.promo_price_usd ?? project.price_usd);
  const isFree = price <= 0;
  const status = myRequest?.status;
  const memberWord = kind === "cohort" ? "participants" : "members";
  const goLogin = () => router.replace(`/login?redirect=${encodeURIComponent(pathname)}` as Href);

  const schedule =
    kind === "cohort" && info
      ? info.start_date && info.end_date
        ? `${fmt(info.start_date)} – ${fmt(info.end_date)}`
        : info.start_date
          ? `Starts ${fmt(info.start_date)}`
          : info.end_date
            ? `Ends ${fmt(info.end_date)}`
            : null
      : null;

  let action: React.ReactNode;
  if (info?.is_closed) {
    action = <Text className="text-sm text-ink-muted">This cohort has ended.</Text>;
  } else if (project.is_private) {
    action = (
      <View className="flex-row items-start gap-2">
        <Icon as={Lock} size={16} className="mt-0.5 text-ink-muted" />
        <Text className="min-w-0 flex-1 text-sm text-ink-muted">This group is private. The host adds the people who can join.</Text>
      </View>
    );
  } else if (!isFree) {
    action = (
      <Button
        loading={purchase.isPending}
        onPress={() => {
          if (isGuest) return goLogin();
          purchase.mutate(projectId, {
            onSuccess: () => {
              invalidateRoomMembership(queryClient, projectId);
              toast(`You're in. Welcome to ${project.title}.`, { variant: "success" });
            },
            onError: (err) => toast(friendlyError(err, "Couldn't complete your purchase."), { variant: "error" }),
          });
        }}
      >
        {`Join · ${formatUsd(price)}`}
      </Button>
    );
  } else if (kind === "community" && info?.join_mode === "open") {
    action = (
      <Button
        loading={joinOpen.isPending}
        onPress={() => {
          if (isGuest) return goLogin();
          joinOpen.mutate(undefined, {
            onSuccess: () => toast(`You joined ${project.title}.`, { variant: "success" }),
            onError: (err) => toast(friendlyError(err, "Couldn't join."), { variant: "error" }),
          });
        }}
      >
        Join community
      </Button>
    );
  } else if (status === "pending") {
    action = (
      <>
        <Text className="text-sm text-ink-muted">Your request is waiting for a host to review it.</Text>
        <Button
          variant="ghost"
          loading={cancelRequest.isPending}
          onPress={() => cancelRequest.mutate(undefined, { onSuccess: () => toast("Request cancelled.", { variant: "success" }) })}
        >
          Cancel request
        </Button>
      </>
    );
  } else {
    action = (
      <>
        <Text className="text-sm text-ink-muted">
          {status === "declined" ? "Your last request wasn't accepted. You can ask again." : "A host reviews every request to join this group."}
        </Text>
        <Button
          loading={requestJoin.isPending}
          onPress={() => {
            if (isGuest) return goLogin();
            requestJoin.mutate(undefined, {
              onSuccess: () => toast("Request sent.", { variant: "success" }),
              onError: (err) => toast(friendlyError(err, "Couldn't send your request."), { variant: "error" }),
            });
          }}
        >
          {status === "declined" ? "Ask again" : "Request to join"}
        </Button>
      </>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} className="mb-4 self-start">
          <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
        </Pressable>
        {project.thumbnail_url ? <Image source={{ uri: project.thumbnail_url }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 16, marginBottom: 16 }} contentFit="cover" /> : null}
        <Text className="text-[11px] font-medium uppercase tracking-wide text-accent">{GROUP_KIND_LABEL[kind]}</Text>
        <Text className="mt-1 font-display text-2xl text-ink">{project.title}</Text>
        <View className="mt-1.5 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          {info ? (
            <View className="flex-row items-center gap-1">
              <Icon as={Users} size={13} className="text-ink-muted" />
              <Text className="text-xs text-ink-muted">{`${info.member_count} ${memberWord}`}</Text>
            </View>
          ) : null}
          {schedule ? (
            <View className="flex-row items-center gap-1">
              <Icon as={Calendar} size={13} className="text-ink-muted" />
              <Text className="text-xs text-ink-muted">{schedule}</Text>
            </View>
          ) : null}
          {!isFree && !project.is_private ? <Text className="text-xs text-ink-muted">{formatUsd(price)}</Text> : null}
        </View>
        {project.description ? <Text className="mt-4 text-sm text-ink-muted">{project.description}</Text> : null}
        <View className="mt-6 gap-2">{action}</View>
      </ScrollView>
    </View>
  );
}
