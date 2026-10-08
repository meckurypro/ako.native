// src/components/room/HostSettingsPanel.tsx
// Host-only cohort settings: chat restrictions and co-host management.
import { Shield } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { useAddRoomModerator, useRemoveRoomModerator, useRoomDetails, useRoomMembersList, useRoomModerators, useUpdateRoomDetails } from "@/hooks/useRoom";

export function HostSettingsPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const { data: details } = useRoomDetails(projectId);
  const { data: members } = useRoomMembersList(projectId);
  const { data: moderators } = useRoomModerators(projectId);
  const updateDetails = useUpdateRoomDetails(projectId);
  const addModerator = useAddRoomModerator(projectId);
  const removeModerator = useRemoveRoomModerator(projectId);

  const moderatorIds = new Set((moderators ?? []).map((m) => m.user_id));
  const onError = () => toast("Couldn't update that.", { variant: "error" });

  return (
    <View className="mb-4 gap-3 rounded-xl border border-border bg-surface p-3">
      <View className="flex-row items-center gap-1.5">
        <Icon as={Shield} size={14} className="text-ink-muted" />
        <Text className="text-sm font-medium text-ink">Cohort settings</Text>
      </View>

      <View className="gap-2.5">
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
        <Text className="mb-1.5 text-xs text-ink-muted">Co-hosts</Text>
        <View className="gap-1.5">
          {(members ?? []).map((m) => (
            <View key={m.user_id} className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size="sm" />
                <Text numberOfLines={1} className="shrink text-sm text-ink">
                  {m.profile.display_name}
                </Text>
              </View>
              {moderatorIds.has(m.user_id) ? (
                <Pressable
                  onPress={() => removeModerator.mutate(m.user_id, { onSuccess: () => toast(`${m.profile.display_name} is no longer a co-host.`, { variant: "success" }), onError })}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text className="text-xs font-medium text-danger">Remove</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => addModerator.mutate(m.user_id, { onSuccess: () => toast(`${m.profile.display_name} is now a co-host.`, { variant: "success" }), onError })}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text className="text-xs font-medium text-accent">Make co-host</Text>
                </Pressable>
              )}
            </View>
          ))}
          {(members ?? []).length === 0 && <Text className="text-xs text-ink-muted">No members yet.</Text>}
        </View>
      </View>
    </View>
  );
}
