// src/components/room/HostSettingsPanel.tsx
// Host-only group settings: join requests, chat restrictions, what new members see, adding people,
// members (co-host / remove / remove + blacklist) and the blacklist.
import { router, type Href } from "expo-router";
import { Ban, Shield, UserPlus } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import {
  findProfileByUsername,
  useAddRoomMember,
  useAddRoomModerator,
  useRemoveRoomMember,
  useRemoveRoomModerator,
  useReviewRoomJoinRequest,
  useRoomBlocklist,
  useRoomDetails,
  useRoomJoinRequests,
  useRoomMembersList,
  useRoomModerators,
  useUnblacklistRoomUser,
  useUpdateRoomDetails,
  type RoomHistoryMode,
} from "@/hooks/useRoom";
import { useTheme } from "@/theme/ThemeProvider";

const HISTORY_OPTIONS: { value: RoomHistoryMode; label: string; hint: string }[] = [
  { value: "anchored", label: "Anchored only", hint: "New members see anchored messages and anything from when they joined." },
  { value: "admins_and_anchored", label: "Hosts + anchored", hint: "New members also see everything the hosts wrote." },
  { value: "all", label: "Everything", hint: "New members can read the whole chat history." },
];

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

type Person = { username: string; display_name: string; avatar_url: string | null };

function PersonLink({ person }: { person: Person }) {
  return (
    <Pressable onPress={() => router.push(`/profile/${person.username}` as Href)} accessibilityRole="link" accessibilityLabel={`${person.display_name}'s profile`} className="min-w-0 flex-1 flex-row items-center gap-1.5">
      <Avatar src={person.avatar_url} name={person.display_name} size="sm" />
      <View className="min-w-0 shrink">
        <Text numberOfLines={1} className="text-sm text-ink">{person.display_name}</Text>
        <Text numberOfLines={1} className="text-[11px] text-ink-muted">@{person.username}</Text>
      </View>
    </Pressable>
  );
}

export function HostSettingsPanel({ projectId, isOwner = false }: { projectId: string; isOwner?: boolean }) {
  const toast = useToast();
  const { colors } = useTheme();
  const { data: details } = useRoomDetails(projectId);
  const { data: members } = useRoomMembersList(projectId);
  const { data: moderators } = useRoomModerators(projectId);
  const { data: requests } = useRoomJoinRequests(projectId);
  const { data: blocklist } = useRoomBlocklist(projectId);
  const updateDetails = useUpdateRoomDetails(projectId);
  const addModerator = useAddRoomModerator(projectId);
  const removeModerator = useRemoveRoomModerator(projectId);
  const review = useReviewRoomJoinRequest(projectId);
  const addMember = useAddRoomMember(projectId);
  const removeMember = useRemoveRoomMember(projectId);
  const unblacklist = useUnblacklistRoomUser(projectId);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);

  const moderatorIds = new Set((moderators ?? []).map((m) => m.user_id));
  const historyMode = details?.history_mode ?? "anchored";
  const onError = () => toast("Couldn't update that.", { variant: "error" });

  async function handleAdd() {
    if (!username.trim()) return;
    setAdding(true);
    try {
      const profile = await findProfileByUsername(username);
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

  function decide(userId: string, name: string, approve: boolean) {
    review.mutate(
      { userId, approve },
      {
        onSuccess: () => toast(approve ? `${name} joined the room.` : `Declined ${name}.`, { variant: "success" }),
        onError: (err) => toast(errorMessage(err, "Couldn't update that request."), { variant: "error" }),
      }
    );
  }

  function remove(userId: string, name: string, blacklist: boolean) {
    Alert.alert(blacklist ? `Remove ${name} and blacklist them?` : `Remove ${name}?`, blacklist ? "They won't be able to join this room again unless you unblock them." : "They lose access to the room. They can ask to join again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: blacklist ? "Remove & blacklist" : "Remove",
        style: "destructive",
        onPress: () =>
          removeMember.mutate(
            { userId, blacklist },
            {
              onSuccess: () => toast(blacklist ? `${name} was removed and blacklisted.` : `${name} was removed.`, { variant: "success" }),
              onError: (err) => toast(errorMessage(err, "Couldn't remove them."), { variant: "error" }),
            }
          ),
      },
    ]);
  }

  return (
    <View className="mb-4 gap-4 rounded-xl border border-border bg-surface p-3">
      <View className="flex-row items-center gap-1.5">
        <Icon as={Shield} size={14} className="text-ink-muted" />
        <Text className="text-sm font-medium text-ink">Group settings</Text>
      </View>

      {(requests ?? []).length > 0 && (
        <View>
          <Text className="mb-1.5 text-xs text-ink-muted">Requests to join ({requests!.length})</Text>
          <View className="gap-2">
            {requests!.map((r) => (
              <View key={r.user_id} className="gap-1.5 rounded-lg bg-canvas p-2">
                <View className="flex-row items-center justify-between gap-2">
                  <PersonLink person={r.profile} />
                  <View className="shrink-0 flex-row items-center gap-1.5">
                    <Pressable onPress={() => decide(r.user_id, r.profile.display_name, false)} disabled={review.isPending} accessibilityRole="button" className="rounded-full border border-border px-2.5 py-1">
                      <Text className="text-xs text-ink-muted">Decline</Text>
                    </Pressable>
                    <Pressable onPress={() => decide(r.user_id, r.profile.display_name, true)} disabled={review.isPending} accessibilityRole="button" className="rounded-full bg-cta px-2.5 py-1">
                      <Text className="text-xs font-medium text-white">Accept</Text>
                    </Pressable>
                  </View>
                </View>
                {r.message ? <Text className="px-1 text-xs text-ink-muted">“{r.message}”</Text> : null}
              </View>
            ))}
          </View>
          <Text className="mt-1 text-[11px] text-ink-muted">Tap a name or photo to see their profile first.</Text>
        </View>
      )}

      <View className="gap-2.5">
        {details?.kind === "community" ? (
          <View className="flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 text-sm text-ink-muted">Anyone can join without approval</Text>
            <Toggle checked={details.join_mode === "open"} onChange={(v) => updateDetails.mutate({ join_mode: v ? "open" : "request" }, { onError })} accessibilityLabel="Anyone can join without approval" />
          </View>
        ) : null}
        <View className="flex-row items-center justify-between gap-3">
          <Text className="min-w-0 flex-1 text-sm text-ink-muted">Only hosts can post in chat</Text>
          <Toggle checked={!!details?.hosts_only_chat} onChange={(v) => updateDetails.mutate({ hosts_only_chat: v }, { onError })} accessibilityLabel="Only hosts can post in chat" />
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="min-w-0 flex-1 text-sm text-ink-muted">Mute chat for everyone</Text>
          <Toggle checked={!!details?.chat_muted} onChange={(v) => updateDetails.mutate({ chat_muted: v }, { onError })} accessibilityLabel="Mute chat for everyone" />
        </View>
      </View>

      <View>
        <Text className="mb-1.5 text-xs text-ink-muted">What new members see</Text>
        <View className="gap-1">
          {HISTORY_OPTIONS.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => updateDetails.mutate({ history_mode: o.value }, { onError })}
              accessibilityRole="radio"
              accessibilityState={{ selected: historyMode === o.value }}
              className={`rounded-lg border px-2.5 py-1.5 ${historyMode === o.value ? "border-accent bg-accent-soft-a60" : "border-border"}`}
            >
              <Text className={`text-sm font-medium ${historyMode === o.value ? "text-ink" : "text-ink-muted"}`}>{o.label}</Text>
              <Text className="text-[11px] text-ink-muted">{o.hint}</Text>
            </Pressable>
          ))}
        </View>
        <Text className="mt-1 text-[11px] text-ink-muted">Anchored messages are always visible to new members.</Text>
      </View>

      <View>
        <Text className="mb-1.5 text-xs text-ink-muted">Add someone</Text>
        <View className="flex-row items-center gap-2">
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="@username"
            placeholderTextColor={colors.inkMuted}
            autoCapitalize="none"
            autoCorrect={false}
            className="min-w-0 flex-1 rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink"
            style={{ fontFamily: "Inter_400Regular" }}
            accessibilityLabel="Username to add"
          />
          <Pressable onPress={handleAdd} disabled={adding || !username.trim()} accessibilityRole="button" className={`flex-row items-center gap-1 rounded-lg bg-cta px-3 py-2 ${adding || !username.trim() ? "opacity-50" : ""}`}>
            <Icon as={UserPlus} size={14} className="text-white" />
            <Text className="text-sm font-medium text-white">Add</Text>
          </Pressable>
        </View>
      </View>

      <View>
        <Text className="mb-1.5 text-xs text-ink-muted">Members</Text>
        <View className="gap-2">
          {(members ?? []).map((m) => {
            const isMod = moderatorIds.has(m.user_id);
            const name = m.profile.display_name;
            return (
              <View key={m.user_id} className="flex-row items-center justify-between gap-2">
                <PersonLink person={m.profile} />
                <View className="shrink-0 flex-row items-center gap-3">
                  {isMod ? (
                    isOwner ? (
                      <Pressable onPress={() => removeModerator.mutate(m.user_id, { onSuccess: () => toast(`${name} is no longer a co-host.`, { variant: "success" }), onError })} accessibilityRole="button" hitSlop={8}>
                        <Text className="text-xs font-medium text-danger">Remove co-host</Text>
                      </Pressable>
                    ) : null
                  ) : (
                    <>
                      {isOwner && (
                        <Pressable onPress={() => addModerator.mutate(m.user_id, { onSuccess: () => toast(`${name} is now a co-host.`, { variant: "success" }), onError })} accessibilityRole="button" hitSlop={8}>
                          <Text className="text-xs font-medium text-accent">Co-host</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => remove(m.user_id, name, false)} accessibilityRole="button" hitSlop={8}>
                        <Text className="text-xs font-medium text-danger">Remove</Text>
                      </Pressable>
                      <Pressable onPress={() => remove(m.user_id, name, true)} accessibilityRole="button" accessibilityLabel={`Remove ${name} and blacklist`} hitSlop={8}>
                        <Icon as={Ban} size={14} className="text-danger" />
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })}
          {(members ?? []).length === 0 && <Text className="text-xs text-ink-muted">No members yet.</Text>}
        </View>
      </View>

      {(blocklist ?? []).length > 0 && (
        <View>
          <Text className="mb-1.5 text-xs text-ink-muted">Blacklisted ({blocklist!.length})</Text>
          <View className="gap-2">
            {blocklist!.map((b) => (
              <View key={b.user_id} className="flex-row items-center justify-between gap-2">
                <PersonLink person={b.profile} />
                <Pressable
                  onPress={() =>
                    unblacklist.mutate(b.user_id, {
                      onSuccess: () => toast(`${b.profile.display_name} can request to join again.`, { variant: "success" }),
                      onError: (err) => toast(errorMessage(err, "Couldn't update the blacklist."), { variant: "error" }),
                    })
                  }
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text className="text-xs font-medium text-accent">Unblock</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
