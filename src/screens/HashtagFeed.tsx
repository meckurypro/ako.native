// src/screens/HashtagFeed.tsx
import { ArrowLeft } from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PostCard } from "@/components/post/PostCard";
import { PostList } from "@/components/post/PostList";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useHashtagPosts } from "@/hooks/useHashtags";
import { useSmartBack } from "@/hooks/useSmartBack";

export function HashtagFeed() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const smartBack = useSmartBack();
  const insets = useSafeAreaInsets();
  const { data: posts, isLoading, error, refetch } = useHashtagPosts(tag ?? "");

  return (
    <View className="flex-1 bg-canvas">
      <PostList
        posts={posts ?? []}
        isLoading={isLoading}
        error={error}
        underTopBar={false}
        exhausted
        onRefresh={() => refetch()}
        renderPost={(post, { visible }) => <PostCard post={post} visible={visible} />}
        header={
          <View className="mb-4 flex-row items-center gap-3" style={{ paddingTop: insets.top }}>
            <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
              <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
            </Pressable>
            <Text className="font-display text-xl text-ink">#{tag}</Text>
          </View>
        }
        emptyState={!isLoading ? <Text className="py-10 text-center text-sm text-ink-muted">No posts with #{tag} yet.</Text> : null}
      />
    </View>
  );
}
