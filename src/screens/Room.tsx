// src/screens/Room.tsx
// A Group — a cohort or a community. Members get the group's chat, meetings and updates; cohorts add a classroom
// with assignments. Hosts also get group settings. Gates: not a member → the landing page (join / request / buy /
// invitation only); before a cohort's start date → countdown; after its end date → archive (media stays,
// chat/meetings/assignments close). Communities never close.
import { router, useLocalSearchParams, type Href } from "expo-router";
import { ArrowLeft, BookOpen, Calendar, ClipboardList, Eye, EyeOff, LogOut, MessageCircle, Settings, Users, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AssignmentsTab } from "@/components/room/AssignmentsTab";
import { ClassroomTab } from "@/components/room/ClassroomTab";
import { HostSettingsPanel } from "@/components/room/HostSettingsPanel";
import { JoinGate } from "@/components/room/JoinGate";
import { MeetingsTab } from "@/components/room/MeetingsTab";
import { RoomChat } from "@/components/room/RoomChat";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useProjectOwnership } from "@/hooks/useProjectOwnership";
import { formatCountdown, useCountdown } from "@/hooks/useCountdown";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useAuth } from "@/hooks/useAuth";
import { GROUP_KIND_LABEL, type GroupKind } from "@/lib/groups";
import { useProject } from "@/hooks/useProjects";
import { useGroupPublicInfo, useIsRoomHost, useIsRoomMember, useLeaveRoom, useRoomConversationId, useRoomDetails, useRoomIsClosed, useRoomJoinRequests, useRoomMemberCount } from "@/hooks/useRoom";

type Tab = "classroom" | "chat" | "meetings" | "assignments";

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
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
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

  // A cohort opens on its classroom; a community opens on its chat — that's where the people are.
  const [pickedTab, setTab] = useState<Tab | null>(null);
  const tab: Tab = pickedTab ?? (isCohort ? "classroom" : "chat");
  const [chatVisited, setChatVisited] = useState(false);
  // A join-request notification opens the room with settings already showing.
  const [showSettings, setShowSettings] = useState(settings === "1");
  const { data: pendingRequests } = useRoomJoinRequests(projectId, isHost);
  const leaveRoom = useLeaveRoom(projectId ?? "");
  const [viewArchivedChat, setViewArchivedChat] = useState(false);
  const getConversationId = useRoomConversationId(projectId ?? "");
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Lift the whole screen above the keyboard so docked composers stay visible.
  const rootStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));

  // Resolve (or create) the group conversation the first time the chat tab opens.
  useEffect(() => {
    if (tab === "chat") setChatVisited(true);
    if (tab === "chat" && hasAccess && !conversationId && !getConversationId.isPending) {
      getConversationId.mutate(undefined, { onSuccess: (id) => setConversationId(id) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, hasAccess]);

  // If the cohort closes while a closed-only tab is open, fall back to the classroom.
  useEffect(() => {
    if (isClosed && (tab === "meetings" || tab === "assignments")) setTab("classroom");
    if (isClosed && !isHost && tab === "chat") setTab("classroom");
    // A community has no assignments tab.
    if (!isCohort && tab === "assignments") setTab("chat");
  }, [isClosed, isHost, tab, isCohort]);

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

  const showChatTab = !isClosed || isHost;
  const chatUnlockedForMe = !isClosed || isHost || viewArchivedChat;
  const tabs: [Tab, string, LucideIcon][] = isCohort
    ? [
        ["classroom", "Classroom", BookOpen],
        ...(showChatTab ? ([["chat", "Chat", MessageCircle]] as [Tab, string, LucideIcon][]) : []),
        ...(!isClosed
          ? ([
              ["meetings", "Meetings", Calendar],
              ["assignments", "Assignments", ClipboardList],
            ] as [Tab, string, LucideIcon][])
          : []),
      ]
    : [
        ["chat", "Chat", MessageCircle],
        ["classroom", "Updates", BookOpen],
        ["meetings", "Meetings", Calendar],
      ];
  const paneStyle = (key: Tab) => ({ flex: 1, display: tab === key ? ("flex" as const) : ("none" as const) });

  return (
    <Animated.View style={rootStyle} className="flex-1 bg-canvas">
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top + 16 }}>
        <View className="mb-3 flex-row items-center justify-between px-4">
          <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
            <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
          </Pressable>
          <View className="flex-row items-center gap-4">
            {!isOwner && !isHost && isMember && (
              <Pressable
                onPress={() =>
                  Alert.alert(`Leave “${project.title}”?`, "You'll lose access unless you join again.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Leave",
                      style: "destructive",
                      onPress: () =>
                        leaveRoom.mutate(undefined, {
                          onSuccess: () => {
                            toast("You left the group.", { variant: "success" });
                            smartBack();
                          },
                          onError: (err) => toast(err instanceof Error ? err.message : "Couldn't leave the group.", { variant: "error" }),
                        }),
                    },
                  ])
                }
                accessibilityRole="button"
                accessibilityLabel="Leave group"
                hitSlop={12}
                className="flex-row items-center gap-1"
              >
                <Icon as={LogOut} size={16} className="text-ink-muted" />
                <Text className="text-xs text-ink-muted">Leave</Text>
              </Pressable>
            )}
            {isHost && (
              <Pressable onPress={() => setShowSettings((s) => !s)} accessibilityRole="button" accessibilityLabel="Group settings" accessibilityState={{ expanded: showSettings }} hitSlop={12}>
                <Icon as={Settings} size={20} className="text-ink-muted" />
                {(pendingRequests ?? []).length > 0 && (
                  <View className="absolute -right-1.5 -top-1.5 h-4 min-w-[16px] items-center justify-center rounded-full bg-cta px-1">
                    <Text className="text-[10px] text-white">{pendingRequests!.length}</Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>
        </View>

        <View className="mb-3 flex-row items-center justify-between px-4">
          <Text numberOfLines={1} className="min-w-0 flex-1 font-display text-2xl text-ink">
            {project.title}
          </Text>
          <View className="ml-2 shrink-0 flex-row items-center gap-1">
            <Icon as={Users} size={13} className="text-ink-muted" />
            <Text className="text-xs text-ink-muted">{memberCount ?? 0}</Text>
          </View>
        </View>

        {isClosed && (
          <View className="mx-4 mb-3 flex-row items-center justify-between rounded-xl bg-accent-soft-a60 px-3 py-2">
            <Text className="min-w-0 flex-1 text-sm text-ink-muted">{`This ${kindLabel.toLowerCase()} has ended — media stays here for people who were in it.`}</Text>
            {isHost && (
              <Pressable onPress={() => setViewArchivedChat((v) => !v)} accessibilityRole="button" className="ml-2 shrink-0 flex-row items-center gap-1" hitSlop={8}>
                <Icon as={viewArchivedChat ? EyeOff : Eye} size={13} className="text-accent" />
                <Text className="text-sm font-medium text-accent">{viewArchivedChat ? "Hide chat" : "View chat"}</Text>
              </Pressable>
            )}
          </View>
        )}

        {showSettings && isHost && (
          <ScrollView showsHorizontalScrollIndicator={false} className="mx-4" style={{ maxHeight: 420, flexGrow: 0 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <HostSettingsPanel projectId={project.id} isOwner={isOwner} />
          </ScrollView>
        )}

        <View className="mb-3 flex-row border-b border-border px-4" accessibilityRole="tablist">
          {tabs.map(([key, label, TabIcon]) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
              className={`-mb-px flex-row items-center gap-1 border-b-2 px-2.5 py-2 ${tab === key ? "border-accent" : "border-transparent"}`}
            >
              <Icon as={TabIcon} size={13} className={tab === key ? "text-accent" : "text-ink-muted"} />
              <Text className={`text-xs font-medium ${tab === key ? "text-accent" : "text-ink-muted"}`}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Every pane stays mounted (just hidden) so drafts, scroll and open forms survive tab switches. */}
        <View style={paneStyle("classroom")}>
          <ClassroomTab projectId={project.id} isHost={isHost} />
        </View>
        {showChatTab && chatVisited && (
          <View style={paneStyle("chat")} className="px-4">
            {!chatUnlockedForMe ? (
              <Text className="text-xs text-ink-muted">Chat closed when the cohort ended.</Text>
            ) : conversationId ? (
              <RoomChat
                projectId={project.id}
                conversationId={conversationId}
                isHost={isHost}
                canPost={!isClosed && (isHost || !details?.hosts_only_chat) && !(details?.chat_muted && !isHost)}
                cantPostReason={isClosed ? "This cohort has ended." : details?.chat_muted ? "Chat is muted." : details?.hosts_only_chat ? "Only hosts can post here." : undefined}
              />
            ) : (
              <Text className="text-xs text-ink-muted">Loading chat…</Text>
            )}
          </View>
        )}
        {!isClosed && (
          <>
            <View style={paneStyle("meetings")}>
              <MeetingsTab projectId={project.id} isHost={isHost} />
            </View>
            {isCohort ? (
              <View style={paneStyle("assignments")}>
                <AssignmentsTab projectId={project.id} isHost={isHost} />
              </View>
            ) : null}
          </>
        )}
      </View>
    </Animated.View>
  );
}
