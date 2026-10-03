// src/components/post/RepostEmbed.tsx
// The original post under a QUOTE reshare: a bordered, truncated card with the
// original author's details. (A plain reshare shows the original inline instead
// — see PostCard.) Falls back to a notice when the original is deleted/archived.
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { timeAgo } from "@/lib/timeAgo";
import type { RepostSource } from "@/types/database";
import { SlideCarousel } from "./PostMedia";

function ignoreTap() {}

function Notice({ children }: { children: string }) {
  return (
    <View className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
      <Text className="text-sm text-ink-muted">{children}</Text>
    </View>
  );
}

export function RepostEmbed({ source }: { source: RepostSource | null | undefined }) {
  if (!source || source.is_deleted) return <Notice>This post is no longer available.</Notice>;
  if (source.is_archived) return <Notice>This post has been archived by its author.</Notice>;

  const preview = source.content.length > 240 ? `${source.content.slice(0, 240)}…` : source.content;

  return (
    <Pressable
      onPress={() => router.push(`/post/${source.id}` as Href)}
      accessibilityRole="link"
      className="mt-3 rounded-xl border border-border bg-surface px-3.5 py-3 active:bg-canvas/50"
    >
      <View className="flex-row items-center gap-2">
        <Avatar src={source.author.avatar_url} name={source.author.display_name} size="sm" />
        <Text numberOfLines={1} className="shrink font-display text-sm font-semibold text-ink">{`@${source.author.username}`}</Text>
        <Text className="shrink-0 text-xs text-ink-muted">{timeAgo(source.created_at)}</Text>
      </View>

      {source.heading ? <Text className="mt-1.5 font-display text-sm font-semibold text-ink">{source.heading}</Text> : null}
      {preview ? <Text className="mt-1 text-sm text-ink">{preview}</Text> : null}

      {source.media_urls.length === 1 ? (
        <View className="mt-2 h-32 w-full overflow-hidden rounded-lg border border-border bg-surface">
          <Image source={{ uri: source.media_urls[0] }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
        </View>
      ) : null}

      {/* A real swipeable carousel (not a static first-image thumbnail); it owns
          horizontal drags so paging images never drags the feed to another tab. */}
      {source.media_urls.length > 1 ? (
        <View className="mt-2">
          <SlideCarousel mediaUrls={source.media_urls} onTap={ignoreTap} frameHeight={128} />
        </View>
      ) : null}
    </Pressable>
  );
}
