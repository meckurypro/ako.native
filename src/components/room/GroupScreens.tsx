// src/components/room/GroupScreens.tsx
//
// The group's non-chat screens. The chat itself is the shared MessageThread (same engine as 1:1 chats); everything
// else a group has — Updates, Meetings, Assignments, Members, Settings — is a screen of its own, reached from the
// group info list (tap the group name) or the ⋯ menu in the chat header. Leaving is the very last row of that list
// and nowhere else, so it never reads as a call to action.
import { router, type Href } from "expo-router";
import { BookOpen, Calendar, ChevronRight, ClipboardList, LogOut, MessageCircle, MoreHorizontal, Search, Settings, UserMinus, UserPlus, Users, UserRound, type LucideIcon } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, ScrollView, TextInput, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/styled";
import { OptionsModal, type OptionItem } from "@/components/ui/OptionsModal";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useAuth } from "@/hooks/useAuth";
import { useAddRoomModerator, useRemoveRoomMember, useRemoveRoomModerator, useRoomModerators, type RoomPerson } from "@/hooks/useRoom";
import type { GroupKind } from "@/lib/groups";
import { useTheme } from "@/theme/ThemeProvider";

export type GroupView = "info" | "updates" | "meetings" | "assignments" | "members" | "settings";

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// ---------------------------------------------------------------
// Shell: bordered header (back · title) over a scrolling, centred column
// ---------------------------------------------------------------
export function GroupScreenShell({ title, onBack, children, scroll = true }: { title: string; onBack: () => void; children: ReactNode; scroll?: boolean }) {
  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={title} bar onBack={onBack} />
      {scroll ? (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        // The Updates / Meetings / Assignments panes scroll and pad themselves.
        <View className="flex-1 pt-2">{children}</View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------
// Group info: the options list
// ---------------------------------------------------------------
function InfoRow({ icon, label, hint, badge, onPress }: { icon: LucideIcon; label: string; hint?: string; badge?: ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-3 px-4 py-3.5 active:bg-ink-a10">
      <View className="h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
        <Icon as={icon} size={18} className="text-accent" />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-ink">{label}</Text>
        {hint ? (
          <Text numberOfLines={1} className="text-xs text-ink-muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {badge}
      <Icon as={ChevronRight} size={18} className="shrink-0 text-ink-muted" />
    </Pressable>
  );
}

export function GroupInfoScreen({
  title,
  kind,
  kindLabel,
  description,
  thumbnailUrl,
  people,
  isHost,
  isClosed,
  showChat,
  pendingRequests,
  canLeave,
  onBack,
  onOpen,
  onOpenChat,
  onLeave,
}: {
  title: string;
  kind: GroupKind;
  kindLabel: string;
  description: string | null;
  thumbnailUrl: string | null;
  people: RoomPerson[];
  isHost: boolean;
  isClosed: boolean;
  showChat: boolean;
  pendingRequests: number;
  canLeave: boolean;
  onBack: () => void;
  onOpen: (view: GroupView) => void;
  onOpenChat: () => void;
  onLeave: () => void;
}) {
  const isCohort = kind === "cohort";
  const memberWord = people.length === 1 ? "member" : "members";
  const rows: ReactNode[] = [];
  if (showChat) rows.push(<InfoRow key="chat" icon={MessageCircle} label="Chat" hint="Messages from the group" onPress={onOpenChat} />);
  rows.push(<InfoRow key="updates" icon={BookOpen} label={isCohort ? "Classroom" : "Updates"} hint={isCohort ? "Lessons, polls and announcements" : "Announcements, voice notes and polls"} onPress={() => onOpen("updates")} />);
  if (!isClosed) rows.push(<InfoRow key="meetings" icon={Calendar} label="Meetings" hint="Live sessions and recordings" onPress={() => onOpen("meetings")} />);
  if (!isClosed && isCohort) rows.push(<InfoRow key="assignments" icon={ClipboardList} label="Assignments" hint="Work to hand in" onPress={() => onOpen("assignments")} />);
  rows.push(<InfoRow key="members" icon={Users} label="Members" hint={`${people.length} ${memberWord}`} onPress={() => onOpen("members")} />);
  if (isHost) {
    rows.push(
      <InfoRow
        key="settings"
        icon={Settings}
        label="Group settings"
        hint="Chat rules, history, join requests"
        badge={
          pendingRequests > 0 ? (
            <View className="mr-1 h-5 min-w-[20px] items-center justify-center rounded-full bg-cta px-1.5">
              <Text className="text-[11px] font-semibold text-white">{pendingRequests}</Text>
            </View>
          ) : undefined
        }
        onPress={() => onOpen("settings")}
      />
    );
  }

  return (
    <GroupScreenShell title="Group info" onBack={onBack}>
      <View className="items-center px-2 pb-6 pt-2">
        <Avatar src={thumbnailUrl} name={title} size="2xl" />
        <Text className="mt-4 text-center font-display text-2xl leading-tight text-ink">{title}</Text>
        <Text className="mt-1 text-sm text-ink-muted">{`${kindLabel} · ${people.length} ${memberWord}`}</Text>
        {description ? <Text className="mt-3 text-center text-sm leading-5 text-ink-muted">{description}</Text> : null}
        {isClosed ? (
          <View className="mt-3 rounded-full bg-accent-soft-a60 px-3 py-1">
            <Text className="text-xs text-ink-muted">{`This ${kindLabel.toLowerCase()} has ended`}</Text>
          </View>
        ) : null}
      </View>

      <View className="overflow-hidden rounded-2xl border border-border bg-surface">
        {rows.map((row, i) => (
          <View key={i} className={i > 0 ? "border-t border-border" : ""}>
            {row}
          </View>
        ))}
      </View>

      {canLeave ? (
        <View className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface">
          <Pressable onPress={onLeave} accessibilityRole="button" accessibilityLabel="Leave group" className="flex-row items-center gap-3 px-4 py-3.5 active:bg-danger-a10">
            <View className="h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-a10">
              <Icon as={LogOut} size={18} className="text-danger" />
            </View>
            <Text className="font-medium text-danger">Leave group</Text>
          </Pressable>
        </View>
      ) : null}
    </GroupScreenShell>
  );
}

// ---------------------------------------------------------------
// Members: everyone in the group, each row opens their profile
// ---------------------------------------------------------------
type MemberListItem = { kind: "header"; key: string; label: string } | { kind: "person"; key: string; person: RoomPerson };

export function GroupMembersScreen({
  projectId,
  title,
  isCohort,
  people,
  isHost,
  isOwner,
  loading,
  onBack,
}: {
  projectId: string;
  title: string;
  isCohort: boolean;
  people: RoomPerson[];
  isHost: boolean;
  isOwner: boolean;
  loading: boolean;
  onBack: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [actionsFor, setActionsFor] = useState<RoomPerson | null>(null);
  const [confirm, setConfirm] = useState<{ person: RoomPerson; blacklist: boolean } | null>(null);
  const removeMember = useRemoveRoomMember(projectId);
  const addModerator = useAddRoomModerator(projectId);
  const removeModerator = useRemoveRoomModerator(projectId);
  const { data: moderators } = useRoomModerators(projectId);
  const moderatorIds = useMemo(() => new Set((moderators ?? []).map((m) => m.user_id)), [moderators]);

  const q = query.trim().toLowerCase();
  const filtered = q ? people.filter((p) => p.display_name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)) : people;
  const items = useMemo<MemberListItem[]>(() => {
    const hosts = filtered.filter((p) => p.role !== "member");
    const members = filtered.filter((p) => p.role === "member");
    const out: MemberListItem[] = [];
    if (hosts.length) {
      out.push({ kind: "header", key: "h-hosts", label: `${isCohort ? "Instructors" : "Hosts"} · ${hosts.length}` });
      for (const person of hosts) out.push({ kind: "person", key: person.user_id, person });
    }
    if (members.length) {
      out.push({ kind: "header", key: "h-members", label: `Members · ${members.length}` });
      for (const person of members) out.push({ kind: "person", key: person.user_id, person });
    }
    return out;
  }, [filtered, isCohort]);

  const openProfile = (p: RoomPerson) => router.push(`/profile/${p.username}` as Href);

  function actionItems(p: RoomPerson): (OptionItem | "divider")[] {
    const list: (OptionItem | "divider")[] = [{ key: "profile", label: "View profile", icon: <Icon as={UserRound} size={20} className="text-ink" />, onSelect: () => openProfile(p) }];
    if (isOwner && p.role === "member") {
      list.push({
        key: "make-host",
        label: "Make host",
        icon: <Icon as={UserPlus} size={20} className="text-ink" />,
        onSelect: () =>
          addModerator.mutate(p.user_id, {
            onSuccess: () => toast(`${p.display_name} is now a host.`, { variant: "success" }),
            onError: (err) => toast(errorText(err, "Couldn't make them a host."), { variant: "error" }),
          }),
      });
    }
    if (isOwner && moderatorIds.has(p.user_id)) {
      list.push({
        key: "remove-host",
        label: "Remove as host",
        icon: <Icon as={UserMinus} size={20} className="text-ink" />,
        onSelect: () =>
          removeModerator.mutate(p.user_id, {
            onSuccess: () => toast(`${p.display_name} is no longer a host.`, { variant: "success" }),
            onError: (err) => toast(errorText(err, "Couldn't update that host."), { variant: "error" }),
          }),
      });
    }
    if (p.role === "member") {
      list.push(
        "divider",
        { key: "remove", label: "Remove from group", icon: <Icon as={UserMinus} size={20} className="text-danger" />, variant: "danger", onSelect: () => setConfirm({ person: p, blacklist: false }) },
        { key: "block", label: "Remove and block", icon: <Icon as={UserMinus} size={20} className="text-danger" />, variant: "danger", onSelect: () => setConfirm({ person: p, blacklist: true }) }
      );
    }
    return list;
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Members" bar onBack={onBack} />
      <Text numberOfLines={1} className="px-4 pt-2 text-xs text-ink-muted">{`${title} · ${people.length}`}</Text>
      {people.length > 8 ? (
        <View className="mx-4 mt-3 flex-row items-center gap-2 rounded-full border border-border bg-surface px-3.5">
          <Icon as={Search} size={16} className="text-ink-muted" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search members"
            placeholderTextColor={colors.inkMuted}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            className="min-w-0 flex-1 py-2.5 text-[15px] text-ink"
            style={{ fontFamily: "Inter_400Regular" }}
          />
        </View>
      ) : null}

      {loading && people.length === 0 ? (
        <Text className="py-10 text-center text-sm text-ink-muted">Loading members…</Text>
      ) : items.length === 0 ? (
        <Text className="py-10 text-center text-sm text-ink-muted">{q ? "No one matches that." : "No members yet."}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }}
          renderItem={({ item }) => {
            if (item.kind === "header") {
              return <Text className="mb-1.5 mt-4 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{item.label}</Text>;
            }
            const p = item.person;
            const isMe = p.user_id === user?.id;
            const roleLabel = p.role === "owner" ? "Owner" : p.role === "host" ? (isCohort ? "Instructor" : "Host") : null;
            const canManage = isHost && !isMe && (p.role === "member" || (isOwner && moderatorIds.has(p.user_id)));
            return (
              <View className="flex-row items-center border-b border-border bg-surface">
                <Pressable onPress={() => openProfile(p)} accessibilityRole="button" accessibilityLabel={`View ${p.display_name}'s profile`} className="min-w-0 flex-1 flex-row items-center gap-3 px-4 py-2.5 active:bg-ink-a10">
                  <Avatar src={p.avatar_url} name={p.display_name} size="md" />
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text numberOfLines={1} className="shrink font-medium text-ink">
                        {p.display_name}
                      </Text>
                      {p.is_verified ? <VerifiedBadge size={14} className="shrink-0" /> : null}
                      {isMe ? <Text className="shrink-0 text-xs text-ink-muted">(You)</Text> : null}
                    </View>
                    <Text numberOfLines={1} className="text-xs text-ink-muted">{`@${p.username}`}</Text>
                  </View>
                  {roleLabel ? (
                    <View className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5">
                      <Text className="text-[11px] font-medium text-accent">{roleLabel}</Text>
                    </View>
                  ) : null}
                </Pressable>
                {canManage ? (
                  <Pressable onPress={() => setActionsFor(p)} accessibilityRole="button" accessibilityLabel={`Manage ${p.display_name}`} hitSlop={8} className="h-9 w-9 shrink-0 items-center justify-center">
                    <Icon as={MoreHorizontal} size={18} className="text-ink-muted" />
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
      )}

      {actionsFor ? <OptionsModal title={actionsFor.display_name} items={actionItems(actionsFor)} onClose={() => setActionsFor(null)} /> : null}
      {confirm ? (
        <ConfirmDialog
          title={confirm.blacklist ? `Remove and block ${confirm.person.display_name}?` : `Remove ${confirm.person.display_name}?`}
          description={confirm.blacklist ? "They'll be taken out of the group and won't be able to join again." : "They'll be taken out of the group. They can join again if the group allows it."}
          confirmLabel={confirm.blacklist ? "Remove and block" : "Remove"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const { person, blacklist } = confirm;
            setConfirm(null);
            removeMember.mutate(
              { userId: person.user_id, blacklist },
              {
                onSuccess: () => toast(blacklist ? `${person.display_name} was removed and blocked.` : `${person.display_name} was removed.`, { variant: "success" }),
                onError: (err) => toast(errorText(err, "Couldn't remove them."), { variant: "error" }),
              }
            );
          }}
        />
      ) : null}
    </View>
  );
}
