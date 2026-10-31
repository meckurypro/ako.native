// src/components/room/HostSettingsPanel.tsx
// Group settings, laid out like WhatsApp's "Group permissions": grouped rows, each with an icon, a title and the
// CURRENT value underneath. Tapping a choice row opens a small picker; switches sit inline. Sections:
//   Group link      — short link (owner sets it, same as projects/pages), copy, share
//   Joining         — who can join (communities), join requests, add people
//   Messaging       — who can send, mute, what new members can read
//   Managing        — hosts, blocked people
import * as Clipboard from "expo-clipboard";
import { router, type Href } from "expo-router";
import { Ban, Check, ChevronRight, Copy, History, Link2, MailPlus, MessageSquare, Search, Share2, Shield, UserCheck, UserPlus, Users, VolumeX, type LucideIcon } from "lucide-react-native";
import { Children, useState, type ReactNode } from "react";
import { Pressable, Share, TextInput, View } from "react-native";

import { ProjectLinkSheet } from "@/components/project/ProjectLinkSheet";
import { Avatar } from "@/components/ui/Avatar";
import { OptionsModal, type OptionItem } from "@/components/ui/OptionsModal";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import {
  useAddRoomMember,
  useCancelRoomInvite,
  useInviteRoomMember,
  useReviewRoomJoinRequest,
  useRoomBlocklist,
  useRoomCandidates,
  useRoomDetails,
  useRoomInvites,
  useRoomJoinRequests,
  useRoomPeople,
  useUnblacklistRoomUser,
  useUpdateRoomDetails,
  type GroupJoinMode,
  type RoomCandidate,
  type RoomHistoryMode,
} from "@/hooks/useRoom";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { timeAgo } from "@/lib/timeAgo";
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
      {footer ? <Text className="mt-1.5 px-1 text-[11px] leading-snug text-ink-muted">{footer}</Text> : null}
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
// Type-ahead: results update as you type (after a short pause), people you follow come first, and each result says what
// you can do — "Add" puts them straight in, "Invite" is for people who've chosen to join groups by invitation only.
function AddMembersSheet({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const toast = useToast();
  const { colors } = useTheme();
  const addMember = useAddRoomMember(projectId);
  const inviteMember = useInviteRoomMember(projectId);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounced = useDebouncedValue(query.trim(), 200);
  const { data: results, isFetching, isError } = useRoomCandidates(projectId, debounced);
  const waiting = query.trim() !== debounced || isFetching;
  const list = results ?? [];

  async function act(person: RoomCandidate) {
    setBusyId(person.user_id);
    try {
      if (person.add_mode === "invite") {
        await inviteMember.mutateAsync(person.user_id);
        toast(`Invitation sent to ${person.display_name}.`, { variant: "success" });
      } else {
        await addMember.mutateAsync(person.user_id);
        toast(`${person.display_name} was added.`, { variant: "success" });
      }
    } catch (err) {
      toast(errorMessage(err, person.add_mode === "invite" ? "Couldn't send the invitation." : "Couldn't add them."), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SheetFrame title="Add members" subtitle="People who only join by invitation get an invite instead" onClose={onClose} avoidKeyboard heightRatio={0.8} zIndex={55} scrim="ink">
      <View className="mt-1 flex-row items-center rounded-xl bg-canvas px-3">
        <Icon as={Search} size={16} className="text-ink-muted" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people…"
          placeholderTextColor={colors.inkMuted}
          selectionColor={colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          className="min-w-0 flex-1 px-2 py-3 text-sm text-ink"
          style={{ fontFamily: "Inter_400Regular" }}
          accessibilityLabel="Search people to add"
        />
      </View>

      {list.length === 0 ? (
        <Text className="py-8 text-center text-sm text-ink-muted">
          {isError ? "Couldn't search just now. Try again." : waiting ? "Searching…" : query.trim() ? "No one matches that search." : "Type to find people. The people you follow show up here first."}
        </Text>
      ) : (
        <View className="pb-2 pt-2">
          {!query.trim() ? <Text className="px-1 pb-1 text-xs font-semibold uppercase text-ink-muted">People you follow</Text> : null}
          {list.map((p) => {
            const busy = busyId === p.user_id;
            const invite = p.add_mode === "invite";
            return (
              <View key={p.user_id} className="flex-row items-center justify-between gap-2 py-2">
                <PersonLink person={p} />
                {p.state === "member" ? (
                  <Text className="shrink-0 px-2 text-xs text-ink-muted">In the group</Text>
                ) : p.state === "invited" ? (
                  <View className="shrink-0 rounded-full border border-border px-3 py-1.5">
                    <Text className="text-xs text-ink-muted">Invited</Text>
                  </View>
                ) : (
                  <View className="shrink-0 items-end gap-0.5">
                    <Pressable
                      onPress={() => void act(p)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`${invite ? "Invite" : "Add"} ${p.display_name}`}
                      hitSlop={6}
                      className={`flex-row items-center gap-1 rounded-full px-3.5 py-1.5 ${invite ? "border border-accent" : "bg-cta"} ${busy ? "opacity-50" : ""}`}
                    >
                      <Icon as={invite ? MailPlus : UserPlus} size={13} className={invite ? "text-accent" : "text-white"} />
                      <Text className={`text-xs font-medium ${invite ? "text-accent" : "text-white"}`}>{busy ? (invite ? "Inviting…" : "Adding…") : invite ? "Invite" : "Add"}</Text>
                    </Pressable>
                    {invite ? <Text className="text-[10px] text-ink-muted">Invitation only</Text> : null}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </SheetFrame>
  );
}

// Everyone invited who hasn't answered yet — hosts see who invited them and when, and can take an invite back.
function InvitesSheet({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const toast = useToast();
  const { data: invites } = useRoomInvites(projectId);
  const cancel = useCancelRoomInvite(projectId);
  const list = invites ?? [];

  return (
    <SheetFrame title="Pending invites" subtitle="They join as soon as they accept" onClose={onClose} zIndex={55} scrim="ink">
      {list.length === 0 ? (
        <Text className="py-8 text-center text-sm text-ink-muted">No invites waiting for a reply.</Text>
      ) : (
        <View className="gap-3 pb-2 pt-2">
          {list.map((i) => (
            <View key={i.user_id} className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1">
                <PersonLink person={i.profile} />
                <Text className="mt-0.5 pl-10 text-[11px] text-ink-muted">
                  {i.inviter ? `Invited by ${i.inviter.display_name} · ` : "Invited · "}
                  {timeAgo(i.created_at)}
                </Text>
              </View>
              <Pressable
                disabled={cancel.isPending}
                onPress={() =>
                  cancel.mutate(i.user_id, {
                    onSuccess: () => toast(`Invitation to ${i.profile.display_name} cancelled.`, { variant: "success" }),
                    onError: (err) => toast(errorMessage(err, "Couldn't cancel that invitation."), { variant: "error" }),
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Cancel invitation to ${i.profile.display_name}`}
                hitSlop={8}
                className={`shrink-0 rounded-full border border-border px-3 py-1.5 ${cancel.isPending ? "opacity-50" : ""}`}
              >
                <Text className="text-xs font-medium text-danger">Cancel invite</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
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
  const { data: invites } = useRoomInvites(projectId);
  const updateDetails = useUpdateRoomDetails(projectId);
  const review = useReviewRoomJoinRequest(projectId);
  const [picker, setPicker] = useState<Picker>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
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
  const inviteCount = (invites ?? []).length;

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
        <Row icon={UserPlus} title="Add members" value="Search by name or username" onPress={() => setAddOpen(true)} />
        <Row icon={MailPlus} title="Pending invites" value={inviteCount > 0 ? `${inviteCount} waiting for a reply` : "No one waiting"} badge={inviteCount} onPress={() => setInvitesOpen(true)} />
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
      {invitesOpen ? <InvitesSheet projectId={projectId} onClose={() => setInvitesOpen(false)} /> : null}
      {blockedOpen ? <BlockedSheet projectId={projectId} onClose={() => setBlockedOpen(false)} /> : null}
    </View>
  );
}
