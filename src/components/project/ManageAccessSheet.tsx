// src/components/project/ManageAccessSheet.tsx
// Owner tool for a PRIVATE project: search people to add, and see/remove who has access.
import { Search, UserMinus, UserPlus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAddProjectMember, useProjectMembers, useRemoveProjectMember } from "@/hooks/useProjectMembers";
import { useSearchPeople } from "@/hooks/useSearch";
import { useTheme } from "@/theme/ThemeProvider";

export function ManageAccessSheet({ projectId, projectTitle, onClose }: { projectId: string; projectTitle: string; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const { data: results, isLoading: searching } = useSearchPeople(query);
  const { data: members, isLoading: loadingMembers } = useProjectMembers(projectId);
  const addMember = useAddProjectMember(projectId);
  const removeMember = useRemoveProjectMember(projectId);
  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const busy = addMember.isPending || removeMember.isPending;

  return (
    <SheetFrame title="Manage access" subtitle={projectTitle} onClose={onClose} avoidKeyboard heightRatio={0.8} zIndex={55}>
      <View className="mb-3 flex-row items-center rounded-full border border-border bg-canvas px-3.5">
        <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people to add…"
          placeholderTextColor={colors.inkMuted}
          selectionColor={colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          className="ml-2.5 flex-1 py-2.5 text-sm text-ink"
          style={{ fontFamily: "Inter_400Regular" }}
        />
      </View>

      {query.trim().length > 1 ? (
        <View className="mb-2 border-b border-border pb-2">
          {searching ? (
            <Text className="py-6 text-center text-sm text-ink-muted">Searching…</Text>
          ) : !results?.length ? (
            <Text className="py-6 text-center text-sm text-ink-muted">No one found.</Text>
          ) : (
            results.map((person) => {
              const isMember = memberIds.has(person.id);
              return (
                <View key={person.id} className="flex-row items-center gap-3 px-1 py-2.5">
                  <Avatar src={person.avatar_url} name={person.display_name} size="sm" />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm text-ink">
                      {person.display_name}
                    </Text>
                    <Text numberOfLines={1} className="text-xs text-ink-muted">
                      @{person.username}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      isMember
                        ? removeMember.mutate(person.id, { onSuccess: () => toast(`${person.display_name} removed.`, { variant: "success" }) })
                        : addMember.mutate(person.id, { onSuccess: () => toast(`${person.display_name} added.`, { variant: "success" }) })
                    }
                    disabled={busy}
                    accessibilityRole="button"
                    className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${isMember ? "bg-danger/10" : "bg-accent-soft"} ${busy ? "opacity-50" : ""}`}
                  >
                    <Icon as={isMember ? UserMinus : UserPlus} size={13} className={isMember ? "text-danger" : "text-accent"} />
                    <Text className={`text-xs font-medium ${isMember ? "text-danger" : "text-accent"}`}>{isMember ? "Remove" : "Add"}</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      ) : null}

      <Text className="pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
        {members?.length ? `Has access (${members.length})` : "Has access"}
      </Text>

      {loadingMembers ? (
        <Text className="py-6 text-center text-sm text-ink-muted">Loading…</Text>
      ) : !members?.length ? (
        <Text className="px-4 py-6 text-center text-sm text-ink-muted">Nobody's been added yet — search above to give someone access.</Text>
      ) : (
        members.map((m) => (
          <View key={m.user_id} className="flex-row items-center gap-3 px-1 py-2.5">
            <Avatar src={m.profile.avatar_url} name={m.profile.display_name} size="sm" />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-sm text-ink">
                {m.profile.display_name}
              </Text>
              <Text numberOfLines={1} className="text-xs text-ink-muted">
                @{m.profile.username}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                removeMember.mutate(m.user_id, { onSuccess: () => toast(`${m.profile.display_name} removed.`, { variant: "success" }) })
              }
              disabled={removeMember.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${m.profile.display_name}`}
              className={`flex-row items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1.5 ${removeMember.isPending ? "opacity-50" : ""}`}
            >
              <Icon as={UserMinus} size={13} className="text-danger" />
              <Text className="text-xs font-medium text-danger">Remove</Text>
            </Pressable>
          </View>
        ))
      )}
    </SheetFrame>
  );
}
