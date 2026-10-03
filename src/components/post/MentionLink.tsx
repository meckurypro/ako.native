// src/components/post/MentionLink.tsx
// An @handle inside text. Resolves whether the handle is a personal profile or
// a Page (see useAccountKind) and opens the right screen. Nested <Text> presses
// win over a parent Pressable, so tapping a mention inside a post card opens
// the profile instead of the post — the native form of stopPropagation().
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";

import { Text } from "@/components/ui/Text";
import { useAccountKind } from "@/hooks/useAccountKind";

export function MentionLink({ username, children }: { username: string; children: ReactNode }) {
  const { data: kind } = useAccountKind(username);
  const to = kind === "page" ? `/page/${username}` : `/profile/${username}`;

  return (
    <Text className="text-accent" accessibilityRole="link" onPress={() => router.push(to as Href)}>
      {children}
    </Text>
  );
}
