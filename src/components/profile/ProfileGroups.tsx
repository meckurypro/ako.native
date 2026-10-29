// src/components/profile/ProfileGroups.tsx
//
// "Creator, AI for Africa" / "Participant, 30 Days AI Mastery" — the public groups a person has chosen to list.
// The server decides what comes back (their setting, private groups never, private accounts, blocks), so an
// empty list renders nothing at all.
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { useProfileGroups } from "@/hooks/useRoom";
import { getGroupPath, groupRoleLabel } from "@/lib/groups";

const COLLAPSED_COUNT = 3;

export function ProfileGroups({ profileId }: { profileId: string | undefined }) {
  const { data: groups } = useProfileGroups(profileId);
  const [expanded, setExpanded] = useState(false);
  if (!groups || groups.length === 0) return null;

  const shown = expanded ? groups : groups.slice(0, COLLAPSED_COUNT);
  return (
    <View className="mt-4">
      <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">Groups</Text>
      <View className="gap-1">
        {shown.map((g) => (
          <Text key={g.project_id} className="text-sm text-ink-muted">
            {`${groupRoleLabel(g.role, g.kind)}, `}
            <Text onPress={() => router.push(getGroupPath({ id: g.project_id, slug: g.slug }) as Href)} accessibilityRole="link" className="font-medium text-accent">
              {g.title}
            </Text>
          </Text>
        ))}
      </View>
      {groups.length > COLLAPSED_COUNT ? (
        <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" hitSlop={8} className="mt-1 self-start">
          <Text className="text-xs font-medium text-ink-muted">{expanded ? "Show fewer" : `Show all ${groups.length}`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
