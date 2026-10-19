// src/components/comments/ThreadContextRow.tsx
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";

/**
 * A compact, neutral row for what sits ABOVE an opened comment — the original post, then each comment on the
 * way down to it. A thin line runs from one avatar to the next so the chain reads as a single conversation.
 * Neutral on purpose: only the replies below the opened comment carry stance colour.
 */
export function ThreadContextRow({
  to,
  name,
  avatarUrl,
  meta,
  children,
}: {
  to: string;
  name: string;
  avatarUrl: string | null;
  /** e.g. "· 3h" */
  meta?: string;
  children: ReactNode;
}) {
  return (
    <Pressable onPress={() => router.push(to as Href)} accessibilityRole="link" className="flex-row gap-3 pl-3 pr-1 active:bg-surface">
      <View className="flex-shrink-0 items-center pt-3">
        <Avatar src={avatarUrl} name={name} size="sm" />
        <View className="mt-1 w-0.5 flex-1 rounded-full bg-border" />
      </View>
      <View className="min-w-0 flex-1 py-3">
        <Text numberOfLines={1} className="text-sm text-ink">
          <Text className="text-sm font-medium text-ink">{name}</Text>
          {meta ? <Text className="text-sm text-ink-muted"> {meta}</Text> : null}
        </Text>
        <Text numberOfLines={3} className="mt-0.5 text-[15px] leading-snug text-ink-muted">
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

/** Same footprint, for an ancestor that was deleted or can't be shown to this viewer. */
export function ThreadContextGap({ label }: { label: string }) {
  return (
    <View className="flex-row gap-3 pl-3 pr-1">
      <View className="flex-shrink-0 items-center pt-3">
        <View className="h-8 w-8 rounded-full border border-dashed border-border" />
        <View className="mt-1 w-0.5 flex-1 rounded-full bg-border" />
      </View>
      <Text className="min-w-0 flex-1 py-4 text-sm italic text-ink-muted">{label}</Text>
    </View>
  );
}
