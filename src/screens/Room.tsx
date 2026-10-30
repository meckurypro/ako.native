// src/screens/Room.tsx
// A Group — a cohort or a community. Members get the group's chat, meetings and updates; cohorts add a classroom
// with assignments. Hosts also get group settings. Gates: not a member → the landing page (join / request / buy /
// invitation only); before a cohort's start date → countdown; after its end date → archive (media stays,
// chat/meetings/assignments close). Communities never close.
import { router, useLocalSearchParams, type Href } from "expo-router";
import { ArrowLeft, BookOpen, Calendar, ClipboardList, LogOut, Settings, Users } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";

import { AssignmentsTab } from "@/components/room/AssignmentsTab";
import { ClassroomTab } from "@/components/room/ClassroomTab";
import { HostSettingsPanel } from "@/components/room/HostSettingsPanel";
import { JoinGate } from "@/components/room/JoinGate";
import { MeetingsTab } from "@/components/room/MeetingsTab";
import { GroupInfoScreen, GroupMembersScreen, GroupScreenShell, type GroupView } from "@/components/room/GroupScreens";
import { MessageThread, type GroupThreadConfig } from "@/screens/MessageThread";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/styled";
import type { OptionItem } from "@/components/ui/OptionsModal";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useProjectOwnership } from "@/hooks/useProjectOwnership";
import { formatCountdown, useCountdown } from "@/hooks/useCountdown";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useAuth } from "@/hooks/useAuth";
import { GROUP_KIND_LABEL, type GroupKind } from "@/lib/groups";
import { useProject } from "@/hooks/useProjects";
import { useGroupPublicInfo, useIsRoomHost, useIsRoomMember, useLeaveRoom, useRoomConversationId, useRoomDetails, useRoomIsClosed, useRoomJoinRequests, useRoomMemberCount, useRoomPeople } from "@/hooks/useRoom";


function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <Text className="text-ink-muted">Loading…</Text>
    </View>
  );
}

// Signed-out visitors (a shared link) get the group's landing page; joining sends them through login.
function GuestGroup({ projectId }: { projectId: string | undefined }) {
  const { data: project } = useProject(projectId);
  const { data: info } = useGroupPublicInfo(projectId);
  if (!project) return <LoadingScreen />;
  return <JoinGate project={project} info={info} isGuest />;
}

// The group page — at /groups/:id and, through a group's custom slug, at /:slug (which passes the id in).
export function Room({ projectId: projectIdProp }: { projectId?: string } = {}) {
  const params = useLocalSearchParams<{ projectId: string; settings?: string }>();
  const projectId = projectIdProp ?? params.projectId;
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <GuestGroup projectId={projectId} />;
  return <GroupPage projectId={projectId} settings={params.settings} />;
}

function GroupPage({ projectId, settings }: { projectId: string | undefined; settings?: string }) {
  const toast = useToast();
  const smartBack = useSmartBack();
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  // Lift the non-chat screens above the keyboard so their forms stay visible (the chat does this itself).
  const rootStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));
  const { data: project } = useProject(projectId);
  const ownership = useProjectOwnership();
  const isOwner = ownership.isOwner(project);

  const { data: isMember } = useIsRoomMember(projectId);
  const { data: isHostQuery } = useIsRoomHost(projectId);
  const isHost = isOwner || !!isHostQuery;
  const { data: memberCount } = useRoomMemberCount(projectId);
  const hasAccess = isOwner || !!isMember;

  const { data: details } = useRoomDetails(projectId);
  const { data: publicInfo } = useGroupPublicInfo(projectId);
  // A group is a cohort or a community. Members read it from the details; non-members from the public info.
  const kind: GroupKind = details?.kind ?? publicInfo?.kind ?? "community";
  const kindLabel = GROUP_KIND_LABEL[kind];
  const isCohort = kind === "cohort";
  const isClosed = useRoomIsClosed(details);
  const startCountdownMs = useCountdown(details?.start_date ?? undefined);
  const notYetStarted = !!details?.start_date && startCountdownMs !== null && startCountdownMs > 0;

  // A group opens on its chat — that's where the people are. Everything else (Updates / Classroom, Meetings,
  // Assignments, Members, Settings) is its own screen, reached from the group info list or the chat's ⋯ menu. The
  // screens stack: Back (the on-screen arrow or Android's Back) pops one at a time, ending on the chat.
  // A join-request notification opens the group with Settings already showing.
  const [stack, setStack] = useState<GroupView[]>(settings === "1" ? ["settings"] : []);
  const openView = (v: GroupView) => setStack((s) => [...s, v]);
  const popView = () => setStack((s) => s.slice(0, -1));
  useBackDismiss(popView, stack.length > 0);
  const rawView = stack[stack.length - 1] ?? null;
  const showChat = !isClosed || isHost; // a finished cohort's chat is closed to everyone but its hosts

  const { data: pendingRequests } = useRoomJoinRequests(projectId, isHost);
  const { data: people, isLoading: peopleLoading } = useRoomPeople(hasAccess ? projectId : undefined);
  const leaveRoom = useLeaveRoom(projectId ?? "");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const getConversationId = useRoomConversationId(projectId ?? "");
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Resolve (or create) the group conversation the first time the chat is wanted.
  const wantsChat = !rawView && showChat;
  useEffect(() => {
    if (wantsChat && hasAccess && !conversationId && !getConversationId.isPending) {
      getConversationId.mutate(undefined, { onSuccess: (id) => setConversationId(id) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsChat, hasAccess]);

  if (!project) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  if (!hasAccess) {
    return <JoinGate project={project} info={publicInfo} isGuest={false} />;
  }

  if (notYetStarted) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title={project.title} />
        <View className="mt-16 items-center gap-2 px-6">
          <Text className="text-xs uppercase tracking-wide text-ink-muted">Starts in</Text>
          <Text className="font-display text-4xl text-ink">{formatCountdown(startCountdownMs!)}</Text>
        </View>
      </View>
    );
  }

  const everyone = people ?? [];
  const memberTotal = everyone.length || memberCount || 0;
  const canLeave = !isOwner && !isHost && !!isMember;
  const pendingCount = (pendingRequests ?? []).length;

  // Anything the group can't show right now (meetings once a cohort has ended, assignments in a community, settings
  // for non-hosts) falls back to the info list rather than an empty page.
  const allowed: GroupView[] = ["info", "updates", "members", ...(!isClosed ? (["meetings"] as const) : []), ...(!isClosed && isCohort ? (["assignments"] as const) : []), ...(isHost ? (["settings"] as const) : [])];
  const view: GroupView | "chat" = rawView ? (allowed.includes(rawView) ? rawView : "info") : showChat ? "chat" : "updates";
  const updatesLabel = isCohort ? "Classroom" : "Updates";

  const leaveDialog = confirmLeave ? (
    <ConfirmDialog
      title={`Leave “${project.title}”?`}
      description="You'll stop seeing this group's chat and updates. Other members won't be notified."
      confirmLabel="Leave group"
      onCancel={() => setConfirmLeave(false)}
      onConfirm={() => {
        setConfirmLeave(false);
        leaveRoom.mutate(undefined, {
          onSuccess: () => {
            toast("You left the group.", { variant: "success" });
            smartBack();
          },
          onError: (err) => toast(err instanceof Error ? err.message : "Couldn't leave the group.", { variant: "error" }),
        });
      }}
    />
  ) : null;

  if (view === "chat") {
    // The ⋯ menu in the chat header: the group's screens, with Leave last (and only for people who can leave).
    const menuItems: (OptionItem | "divider")[] = [
      { key: "updates", label: updatesLabel, icon: <Icon as={BookOpen} size={20} className="text-ink" />, onSelect: () => openView("updates") },
      ...(!isClosed ? [{ key: "meetings", label: "Meetings", icon: <Icon as={Calendar} size={20} className="text-ink" />, onSelect: () => openView("meetings") } satisfies OptionItem] : []),
      ...(!isClosed && isCohort ? [{ key: "assignments", label: "Assignments", icon: <Icon as={ClipboardList} size={20} className="text-ink" />, onSelect: () => openView("assignments") } satisfies OptionItem] : []),
      { key: "members", label: `Members (${memberTotal})`, icon: <Icon as={Users} size={20} className="text-ink" />, onSelect: () => openView("members") },
      ...(isHost
        ? [
            {
              key: "settings",
              label: "Group settings",
              icon: <Icon as={Settings} size={20} className="text-ink" />,
              badge:
                pendingCount > 0 ? (
                  <View className="h-5 min-w-[20px] items-center justify-center rounded-full bg-cta px-1.5">
                    <Text className="text-[11px] font-semibold text-white">{pendingCount}</Text>
                  </View>
                ) : undefined,
              onSelect: () => openView("settings"),
            } satisfies OptionItem,
          ]
        : []),
      ...(canLeave ? ["divider" as const, { key: "leave", label: "Leave group", icon: <Icon as={LogOut} size={20} className="text-danger" />, variant: "danger", onSelect: () => setConfirmLeave(true) } satisfies OptionItem] : []),
    ];
    const group: GroupThreadConfig = {
      projectId: project.id,
      title: project.title,
      avatarUrl: project.thumbnail_url ?? null,
      people: everyone,
      isHost,
      canPost: !isClosed && (isHost || !details?.hosts_only_chat) && !(details?.chat_muted && !isHost),
      cantPostReason: isClosed ? "This cohort has ended." : details?.chat_muted ? "Chat is muted." : details?.hosts_only_chat ? "Only hosts can post here." : undefined,
      onBack: smartBack,
      onOpenInfo: () => openView("info"),
      onOpenMembers: () => openView("members"),
      onOpenProfile: (username) => router.push(`/profile/${username}` as Href),
      menuItems,
    };
    return (
      <View className="flex-1 bg-canvas">
        {conversationId ? <MessageThread conversationId={conversationId} group={group} /> : <LoadingScreen />}
        {leaveDialog}
      </View>
    );
  }

  if (view === "info") {
    return (
      <Animated.View style={rootStyle} className="flex-1 bg-canvas">
        <GroupInfoScreen
          title={project.title}
          kind={kind}
          kindLabel={kindLabel}
          description={project.description ?? null}
          thumbnailUrl={project.thumbnail_url ?? null}
          people={everyone}
          isHost={isHost}
          isClosed={isClosed}
          showChat={showChat}
          pendingRequests={pendingCount}
          canLeave={canLeave}
          onBack={popView}
          onOpen={openView}
          onOpenChat={() => setStack([])}
          onLeave={() => setConfirmLeave(true)}
        />
        {leaveDialog}
      </Animated.View>
    );
  }

  if (view === "members") {
    return (
      <Animated.View style={rootStyle} className="flex-1 bg-canvas">
        <GroupMembersScreen projectId={project.id} title={project.title} isCohort={isCohort} people={everyone} isHost={isHost} isOwner={isOwner} loading={peopleLoading} onBack={popView} />
      </Animated.View>
    );
  }

  const screenTitle = view === "updates" ? updatesLabel : view === "meetings" ? "Meetings" : view === "assignments" ? "Assignments" : "Group settings";
  return (
    <Animated.View style={rootStyle} className="flex-1 bg-canvas">
    <GroupScreenShell title={screenTitle} onBack={popView} scroll={false}>
      {view === "updates" ? <ClassroomTab projectId={project.id} isHost={isHost} /> : null}
      {view === "meetings" ? <MeetingsTab projectId={project.id} isHost={isHost} /> : null}
      {view === "assignments" ? <AssignmentsTab projectId={project.id} isHost={isHost} /> : null}
      {view === "settings" ? (
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <HostSettingsPanel projectId={project.id} project={project} isOwner={isOwner} onOpenMembers={() => openView("members")} />
        </ScrollView>
      ) : null}
    </GroupScreenShell>
    </Animated.View>
  );
}
