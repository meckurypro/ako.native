// src/components/post/PageRow.tsx
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import type { PageSearchResult } from "@/hooks/useSearch";
import { pageModeLabel } from "@/lib/pageRoles";

export function PageRow({ page }: { page: PageSearchResult }) {
  return (
    <Pressable
      onPress={() => router.push(`/page/${page.username}` as Href)}
      accessibilityRole="link"
      className="min-h-[56px] flex-row items-center gap-3 py-3 active:opacity-70"
    >
      <Avatar src={page.avatar_url} name={page.name} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="shrink text-sm font-medium text-ink">
            {page.name}
          </Text>
          {page.is_verified ? <VerifiedBadge className="shrink-0" /> : null}
        </View>
        <Text numberOfLines={1} className="mt-0.5 text-xs text-ink-muted">
          {page.tagline || `${pageModeLabel(page.page_type)} · @${page.username}`}
        </Text>
        {page.tagline ? (
          <Text numberOfLines={1} className="text-xs text-ink-muted/80">
            {pageModeLabel(page.page_type)} · @{page.username}
          </Text>
        ) : null}
      </View>
      {page.follower_count > 0 ? <Text className="shrink-0 text-xs text-ink-muted">{page.follower_count.toLocaleString()} followers</Text> : null}
    </Pressable>
  );
}
