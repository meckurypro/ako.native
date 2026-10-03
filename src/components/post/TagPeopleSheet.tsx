// src/components/post/TagPeopleSheet.tsx
import { UserPlus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { MentionCandidate } from "@/hooks/useMentions";
import { useSetTaggedUsers, useTaggedUsers, type TagTarget } from "@/hooks/useTagging";
import { PeoplePicker } from "./PeoplePicker";

export function TagPeopleSheet({ target, targetId, onClose }: { target: TagTarget; targetId: string; onClose: () => void }) {
  const { data: tagged, isLoading } = useTaggedUsers(target, targetId);
  const setTagged = useSetTaggedUsers(target);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm(selected: MentionCandidate[]) {
    setError(null);
    setTagged.mutate(
      { targetId, userIds: selected.map((p) => p.id) },
      {
        onSuccess: () => setShowPicker(false),
        onError: (err) => setError(err instanceof Error ? err.message : "Couldn't update tags."),
      }
    );
  }

  return (
    <>
      <SheetFrame
        title="Tag people"
        subtitle={`Tagged people get notified and can be shown on the ${target}.`}
        onClose={onClose}
        footer={
          <Pressable
            onPress={() => setShowPicker(true)}
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-2 rounded-full border border-border py-3 active:bg-canvas"
          >
            <Icon as={UserPlus} size={16} className="text-ink" />
            <Text className="text-sm font-medium text-ink">Manage tags</Text>
          </Pressable>
        }
      >
        {isLoading ? (
          <Text className="py-10 text-center text-sm text-ink-muted">Loading…</Text>
        ) : !tagged || tagged.length === 0 ? (
          <Text className="py-10 text-center text-sm text-ink-muted">No one's tagged yet.</Text>
        ) : (
          <View className="gap-1">
            {tagged.map((t) => (
              <View key={t.user_id} className="flex-row items-center gap-3 px-1 py-2">
                <Avatar src={t.user.avatar_url} name={t.user.display_name} size="sm" />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm font-medium text-ink">
                    {t.user.display_name}
                  </Text>
                  <Text numberOfLines={1} className="text-xs text-ink-muted">
                    @{t.user.username}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        {error ? <Text className="mt-2 text-sm text-danger">{error}</Text> : null}
      </SheetFrame>

      {showPicker ? (
        <PeoplePicker
          title="Tag people"
          subtitle="They'll be notified they were tagged."
          confirmLabel="Save tags"
          initialSelected={(tagged ?? []).map((t) => ({ ...t.user, kind: "profile" as const }))}
          onConfirm={handleConfirm}
          onClose={() => setShowPicker(false)}
        />
      ) : null}
    </>
  );
}
