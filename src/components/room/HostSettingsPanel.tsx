// src/components/room/HostSettingsPanel.tsx
// Group settings, laid out like WhatsApp's "Group permissions": grouped rows, each with an icon, a title and the
// CURRENT value underneath. Tapping a choice row opens a small picker; switches sit inline. Sections:
//   Group link      — short link (owner sets it, same as projects/pages), copy, share
//   Joining         — who can join (communities), join requests, add people
//   Messaging       — who can send, mute, what new members can read
//   Managing        — hosts, blocked people
import * as Clipboard from "expo-clipboard";
import { router, type Href } from "expo-router";
import { Ban, Check, ChevronRight, Copy, History, Link2, MessageSquare, Share2, Shield, UserCheck, UserPlus, Users, VolumeX, type LucideIcon } from "lucide-react-native";
import { Children, useState, type ReactNode } from "react";
import { Pressable, Share, TextInput, View } from "react-native";

import { ProjectLinkSheet } from "@/components/project/ProjectLinkSheet";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { OptionsModal, type OptionItem } from "@/components/ui/OptionsModal";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import {
  findProfileByUsername,
  useAddRoomMember,
  useReviewRoomJoinRequest,
  useRoomBlocklist,
  useRoomDetails,
  useRoomJoinRequests,
  useRoomPeople,
  useUnblacklistRoomUser,
  useUpdateRoomDetails,
  type GroupJoinMode,
  type RoomHistoryMode,
} from "@/hooks/useRoom";
import type { Project } from "@/hooks/useProjects";
import { APP_URL } from "@/lib/config";
import { getGroupPath } from "@/lib/groups";
import { useTheme } from "@/theme/ThemeProvider";

const HISTORY_OPTIONS: { value: RoomHistoryMode; label: string; hint: string }[] = [
  { value: "anchored", label: "Anchored only", hint: "New members see anchored messages and anything from when they joined." },
  { value: "admins_and_anchored", label: "Hosts + anchored", hint: "New members also see everything the hosts wrote." },
  { value: "all", label: "Everything", hint: "New members can read the whole chat history." },
];

const HISTORY_SHORT: Record<RoomHistoryMode, string> = { anchored: "Anchored only", admins_and_anchored: "Hosts + anchored", all: "Everything" };

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

type Person = { username: string; display_name: string; avatar_url: string | null };

function PersonLink({ person }: { person: Person }) {
  return (
    <Pressable onPress={() => router.push(`/profile/${person.username}` as Href)} accessibilityRole="link" accessibilityLabel={`${person.display_name}'s profile`} className="min-w-0 flex-1 flex-row items-center gap-2">
      <Avatar src={person.avatar_url} name={person.display_name} size="sm" />
      <View className="min-w-0 shrink">
        <Text numberOfLines={1} className="text-sm text-ink">{person.display_name}</Text>
        <Text numberOfLines={1} className="text-[11px] text-ink-muted">@{person.username}</Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------
function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View>
      <Text className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</Text>
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">
        {rows.map((row, i) => (
          <View key={i} className={i > 0 ? "border-t border-border" : ""}>
            {row}
          </View>
        ))}
      </View>
      {footer ? <Text className="mt-1.5 px-1 text-[11px] leading-4 text-ink-muted">{footer}</Text> : null}
    </View>
  );
}

function IconTile({ icon, danger = false }: { icon: LucideIcon; danger?: boolean }) {
  return (
    <View className={`h-9 w-9 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-danger-a10" : "bg-accent-soft"}`}>
      <Icon as={icon} size={18} className={danger ? "text-danger" : "text-accent"} />
    </View>
  );
}

function Row({ icon, title, value, onPress, right, badge, accessibilityLabel }: { icon: LucideIcon; title: string; value?: string; onPress: () => void; right?: ReactNode; badge?: number; accessibilityLabel?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} className="flex-row items-center gap-3 px-4 py-3 active:bg-ink-a10">
      <IconTile icon={icon} />
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-ink">{title}</Text>
        {value ? <Text numberOfLines={1} className="text-xs text-ink-muted">{value}</Text> : null}
      </View>
      {badge && badge > 0 ? (
        <View className="h-5 min-w-[20px] items-center justify-center rounded-full bg-cta px-1.5">
          <Text className="text-[11px] font-semibold text-white">{badge}</Text>
        </View>
      ) : null}
      {right}
      <Icon as={ChevronRight} size={18} className="shrink-0 text-ink-muted" />
    </Pressable>
  );
}

function ToggleRow({ icon, title, hint, checked, onChange }: { icon: LucideIcon; title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <IconTile icon={icon} />
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-ink">{title}</Text>
        {hint ? <Text className="text-xs text-ink-muted">{hint}</Text> : null}
      </View>
      <Toggle checked={checked} onChange={onChange} accessibilityLabel={title} />
    </View>
  );
}

// ---------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------
function AddMembersSheet({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const toast = useToast();
  const { colors } = useTheme();
  const addMember = useAddRoomMember(projectId);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const name = username.trim();
    if (!name) return;
    setAdding(true);
    try {
      const profile = await findProfileByUsername(name);
      if (!profile) {
        toast("No one has that username.", { variant: "error" });
        return;
      }
      await addMember.mutateAsync(profile.id);
      toast(`${profile.display_name} was added.`, { variant: "success" });
      setUsername("");
    } catch (err) {
      toast(errorMessage(err, "Couldn't add them."), { variant: "error" });
    } finally {
      setAdding(false);
    }
  }

  return (
    <SheetFrame title="Add members" subtitle="Add someone by their username" onClose={onClose} avoidKeyboard zIndex={55} scrim="ink">
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="@username"
        placeholderTextColor={colors.inkMuted}
        selectionColor={colors.accent}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => void handleAdd()}
        className="mt-2 rounded-xl bg-canvas px-4 py-3 text-sm text-ink"
        style={{ fontFamily: "Inter_400Regular" }}
        accessibilityLabel="Username to add"
      />
      <View className="mb-2 mt-4">
        <Button onPress={() => void handleAdd()} loading={adding} disabled={adding || !username.trim()}>
          Add to group
        </Button>
      </View>
    </SheetFrame>
  );
}

function BlockedSheet({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const toast = useToast();
  const { data: blocklist } = useRoomBlocklist(projectId);
  const unblacklist = useUnblacklistRoomUser(projectId);
  const list = blocklist ?? [];

  return (
    <SheetFrame title="Blocked people" subtitle="They can't join this group" onClose={onClose} zIndex={55} scrim="ink">
      {list.length === 0 ? (
        <Text className="py-8 text-center text-sm text-ink-muted">No one is blocked.</Text>
      ) : (
        <View className="gap-3 pb-2 pt-2">
          {list.map((b) => (
            <View key={b.user_id} className="flex-row items-center justify-between gap-2">
              <PersonLink person={b.profile} />
              <Pressable
                onPress={() =>
                  unblacklist.mutate(b.user_id, {
                    onSuccess: () => toast(`${b.profile.display_name} can request to join again.`, { variant: "success" }),
                    onError: (err) => toast(errorMessage(err, "Couldn't update the blocked list."), { variant: "error" }),
                  })
                }
                accessibilityRole="button"
                hitSlop={8}
                className="shrink-0 rounded-full border border-border px-3 py-1.5"
              >
                <Text className="text-xs font-medium text-accent">Unblock</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </SheetFrame>
  );
}

// ---------------------------------------------------------------
// Panel
// ---------------------------------------------------------------
type Picker = "join" | "chat" | "history" | null;

export function HostSettingsPanel({ projectId, project, isOwner = false, onOpenMembers }: { projectId: string; project: Project; isOwner?: boolean; onOpenMembers?: () => void }) {
  const toast = useToast();
  const { data: details } = useRoomDetails(projectId);
  const { data: people } = useRoomPeople(projectId);
  const { data: requests } = useRoomJoinRequests(projectId);
  const { data: blocklist } = useRoomBlocklist(projectId);
  const updateDetails = useUpdateRoomDetails(projectId);
  const review = useReviewRoomJoinRequest(projectId);
  const [picker, setPicker] = useState<Picker>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);

  const historyMode = details?.history_mode ?? "anchored";
  const joinMode: GroupJoinMode = details?.join_mode ?? "request";
  const isCommunity = details?.kind === "community";
  const hostsOnly = !!details?.hosts_only_chat;
  const onError = () => toast("Couldn't update that.", { variant: "error" });

  const groupUrl = `${APP_URL}${getGroupPath(project)}`;
  const shownUrl = groupUrl.replace(/^https?:\/\//, "");
  const hostNames = (people ?? []).filter((p) => p.role !== "member").map((p) => p.display_name);
  const blockedCount = (blocklist ?? []).length;

  async function copyLink() {
    await Clipboard.setStringAsync(groupUrl);
    toast("Link copied.", { variant: "success" });
  }

  async function shareLink() {
    try {
      await Share.share({ title: project.title, message: `${project.title}\n${groupUrl}` });
    } catch {
      // The share sheet being dismissed or unavailable isn't an error worth showing.
    }
  }

  function onLinkRow() {
    if (isOwner) setLinkOpen(true);
    else if (project.slug) void copyLink();
    else toast("Only the group owner can set the link.");
  }

  function decide(userId: string, name: string, approve: boolean) {
    review.mutate(
      { userId, approve },
      {
        onSuccess: () => toast(approve ? `${name} joined the group.` : `Declined ${name}.`, { variant: "success" }),
        onError: (err) => toast(errorMessage(err, "Couldn't update that request."), { variant: "error" }),
      }
    );
  }

  const check = (on: boolean) => (on ? <Icon as={Check} size={18} className="text-accent" /> : undefined);

  function pickerItems(): { title: string; items: OptionItem[] } | null {
    if (picker === "join") {
      return {
        title: "Who can join",
        items: [
          { key: "open", label: "Anyone", description: "People join in one tap, no approval needed.", badge: check(joinMode === "open"), onSelect: () => updateDetails.mutate({ join_mode: "open" }, { onError }) },
          { key: "request", label: "Approval required", description: "A host reviews every request to join.", badge: check(joinMode === "request"), onSelect: () => updateDetails.mutate({ join_mode: "request" }, { onError }) },
        ],
      };
    }
    if (picker === "chat") {
      return {
        title: "Send new messages",
        items: [
          { key: "everyone", label: "Everyone", description: "Every member can post in the chat.", badge: check(!hostsOnly), onSelect: () => updateDetails.mutate({ hosts_only_chat: false }, { onError }) },
          { key: "hosts", label: "Only hosts", description: "Members can read the chat but not post.", badge: check(hostsOnly), onSelect: () => updateDetails.mutate({ hosts_only_chat: true }, { onError }) },
        ],
      };
    }
    if (picker === "history") {
      return {
        title: "Message history for new members",
        items: HISTORY_OPTIONS.map((o) => ({ key: o.value, label: o.label, description: o.hint, badge: check(historyMode === o.value), onSelect: () => updateDetails.mutate({ history_mode: o.value }, { onError }) })),
      };
    }
    return null;
  }
  const active = pickerItems();

  return (
    <View className="gap-6 pb-4">
      {(requests ?? []).length > 0 && (
        <View>
          <Text className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Requests to join · {requests!.length}</Text>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {requests!.map((r, i) => (
              <View key={r.user_id} className={`gap-1.5 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}>
                <View className="flex-row items-center justify-between gap-2">
                  <PersonLink person={r.profile} />
                  <View className="shrink-0 flex-row items-center gap-1.5">
                    <Pressable onPress={() => decide(r.user_id, r.profile.display_name, false)} disabled={review.isPending} accessibilityRole="button" className="rounded-full border border-border px-3 py-1.5">
                      <Text className="text-xs text-ink-muted">Decline</Text>
                    </Pressable>
                    <Pressable onPress={() => decide(r.user_id, r.profile.display_name, true)} disabled={review.isPending} accessibilityRole="button" className="rounded-full bg-cta px-3 py-1.5">
                      <Text className="text-xs font-medium text-white">Accept</Text>
                    </Pressable>
                  </View>
                </View>
                {r.message ? <Text className="px-1 text-xs text-ink-muted">“{r.message}”</Text> : null}
              </View>
            ))}
          </View>
          <Text className="mt-1.5 px-1 text-[11px] text-ink-muted">Tap a name or photo to see their profile first.</Text>
        </View>
      )}

      <Section title="Group link" footer={project.slug ? "Anyone with this link can find the group. Changing it keeps the old link working." : isOwner ? "Pick a short, memorable link like you can for projects and pages." : undefined}>
        <Row
          icon={Link2}
          title="Group link"
          value={project.slug ? shownUrl : isOwner ? "Not set — tap to choose a short link" : "Not set"}
          onPress={onLinkRow}
          right={
            project.slug ? (
              <Pressable onPress={() => void copyLink()} accessibilityRole="button" accessibilityLabel="Copy link" hitSlop={8} className="shrink-0 p-1.5">
                <Icon as={Copy} size={16} className="text-accent" />
              </Pressable>
            ) : undefined
          }
        />
        <Row icon={Share2} title="Share group link" value="Send the link to people outside the group" onPress={() => void shareLink()} />
      </Section>

      <Section title="Joining the group">
        {isCommunity ? <Row icon={UserCheck} title="Who can join" value={joinMode === "open" ? "Anyone" : "Approval required"} onPress={() => setPicker("join")} /> : null}
        <Row icon={UserPlus} title="Add members" value="Add someone by username" onPress={() => setAddOpen(true)} />
      </Section>

      <Section title="Messaging">
        <Row icon={MessageSquare} title="Send new messages" value={hostsOnly ? "Only hosts" : "Everyone"} onPress={() => setPicker("chat")} />
        <ToggleRow icon={VolumeX} title="Mute chat for everyone" hint="Nobody can post until you turn this off" checked={!!details?.chat_muted} onChange={(v) => updateDetails.mutate({ chat_muted: v }, { onError })} />
        <Row icon={History} title="Message history" value={`New members see: ${HISTORY_SHORT[historyMode]}`} onPress={() => setPicker("history")} />
      </Section>

      <Section title="Managing the group" footer="Anchored messages are always visible to new members.">
        <Row icon={Shield} title="Hosts" value={hostNames.length ? hostNames.join(", ") : "Just you"} onPress={() => onOpenMembers?.()} />
        {onOpenMembers ? <Row icon={Users} title="Members" value={`${(people ?? []).length} in this group · tap to manage`} onPress={onOpenMembers} /> : null}
        <Row icon={Ban} title="Blocked people" value={blockedCount > 0 ? `${blockedCount} blocked` : "No one"} onPress={() => setBlockedOpen(true)} />
      </Section>

      {active ? <OptionsModal title={active.title} items={active.items} onClose={() => setPicker(null)} /> : null}
      {linkOpen ? <ProjectLinkSheet project={project} noun="group" onClose={() => setLinkOpen(false)} /> : null}
      {addOpen ? <AddMembersSheet projectId={projectId} onClose={() => setAddOpen(false)} /> : null}
      {blockedOpen ? <BlockedSheet projectId={projectId} onClose={() => setBlockedOpen(false)} /> : null}
    </View>
  );
}
