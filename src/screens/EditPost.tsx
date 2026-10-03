// src/screens/EditPost.tsx
// Edit your own post within its edit window (15 minutes), unless it has
// accepted collaborators. Same fields as Compose minus posting options.
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, X } from "lucide-react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeadingColorPicker } from "@/components/post/HeadingColorPicker";
import { MentionTextarea } from "@/components/post/MentionTextarea";
import { MAX_TOPICS, TopicPicker } from "@/components/post/TopicPicker";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useCollaborators } from "@/hooks/useCollaboration";
import { usePhotoAttachments } from "@/hooks/usePhotoAttachments";
import { canEditPost, usePostTopics, useUpdatePost } from "@/hooks/usePosts";
import { useSmartBack } from "@/hooks/useSmartBack";
import { isVideoUrl } from "@/hooks/useUploadPostMedia";
import { supabase } from "@/lib/supabase";
import { CONTENT_LIMIT, contentCounterClass } from "@/lib/textLimits";
import { useTheme } from "@/theme/ThemeProvider";
import type { PostWithAuthor } from "@/types/database";

const HEADING_LIMIT = 50;

function usePostForEdit(postId: string) {
  return useQuery({
    queryKey: ["post", postId],
    queryFn: async (): Promise<PostWithAuthor> => {
      const { data, error } = await supabase
        .from("posts")
        .select("*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_url, tier)")
        .eq("id", postId)
        .single();
      if (error) throw error;
      return data as unknown as PostWithAuthor;
    },
    enabled: !!postId,
  });
}

function Notice({ message, onBack }: { message: string; onBack?: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 bg-canvas px-4">
      <Text className="text-center text-ink">{message}</Text>
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button">
          <Text className="text-sm font-medium text-accent">Go back</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EditPost() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();
  const { user } = useAuth();
  const { data: post, isLoading } = usePostForEdit(postId);
  const updatePost = useUpdatePost();
  const { data: collaborators } = useCollaborators("post", postId);
  const hasAcceptedCollaborators = (collaborators ?? []).some((c) => c.status === "accepted");
  const { data: existingTopicIds } = usePostTopics(postId);
  const photos = usePhotoAttachments();

  const [heading, setHeading] = useState("");
  const [headingColor, setHeadingColor] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (post && !initialized) {
      setHeading(post.heading ?? "");
      setHeadingColor(post.heading_color ?? null);
      setContent(post.content);
      photos.setMediaUrls(post.media_urls);
      setInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post, initialized]);

  useEffect(() => {
    if (existingTopicIds) setTopicIds(new Set(existingTopicIds));
  }, [existingTopicIds]);

  function toggleTopic(interestId: string) {
    setTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(interestId)) next.delete(interestId);
      else {
        if (next.size >= MAX_TOPICS) return prev;
        next.add(interestId);
      }
      return next;
    });
  }

  const canSave = heading.trim().length > 0 || content.trim().length > 0;

  async function handleSubmit() {
    if (!canSave || !postId) return;
    setError(null);
    try {
      await updatePost.mutateAsync({
        post_id: postId,
        heading: heading.trim() || undefined,
        heading_color: headingColor,
        content,
        interest_ids: Array.from(topicIds),
        media_urls: photos.mediaUrls,
      });
      router.replace(`/post/${postId}` as Href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    }
  }

  if (isLoading || !post) return <Notice message="Loading…" />;
  if (post.author_id !== user?.id) return <Notice message="You can only edit your own posts." />;
  if (!canEditPost(post)) return <Notice message="The 15-minute edit window for this post has passed." onBack={smartBack} />;
  if (hasAcceptedCollaborators) {
    return <Notice message="Posts with a collaborator can't be edited — you can still delete it instead." onBack={smartBack} />;
  }

  const saving = updatePost.isPending;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 32 }}
      >
        <View className="w-full max-w-xl self-center">
          <View className="mb-1 flex-row items-start gap-2">
            <TextInput
              value={heading}
              onChangeText={(v) => setHeading(v.slice(0, HEADING_LIMIT))}
              maxLength={HEADING_LIMIT}
              placeholder="Heading (optional)"
              placeholderTextColor={`${colors.inkMuted}99`}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              className="flex-1 text-2xl leading-tight text-ink"
              style={{ fontFamily: "PlayfairDisplay_600SemiBold", paddingVertical: 0 }}
            />
            {heading.trim().length > 0 ? (
              <View className="pt-1.5">
                <HeadingColorPicker value={headingColor} onChange={setHeadingColor} />
              </View>
            ) : null}
          </View>
          <Text className="mb-3 text-xs text-ink-muted">
            {heading.length}/{HEADING_LIMIT}
          </Text>

          <MentionTextarea value={content} onChange={setContent} maxLength={CONTENT_LIMIT} rows={8} showFormatToolbar />

          {photos.mediaUrls.length > 0 ? (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {photos.mediaUrls.map((url) => (
                <View key={url} className="aspect-square overflow-hidden rounded-xl bg-surface" style={{ width: "48.5%" }}>
                  {isVideoUrl(url) ? null : <Image source={{ uri: url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />}
                  <Pressable
                    onPress={() => photos.removeMedia(url)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    hitSlop={8}
                    className="absolute right-1.5 top-1.5 rounded-full bg-ink/60 p-1"
                  >
                    <Icon as={X} size={14} className="text-canvas" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <View className="mt-3 flex-row items-center justify-between">
            <Pressable
              onPress={photos.addPhotos}
              disabled={photos.uploading || photos.atLimit}
              accessibilityRole="button"
              className={`flex-row items-center gap-1.5 ${photos.uploading || photos.atLimit ? "opacity-50" : ""}`}
            >
              <Icon as={ImageIcon} size={18} className="text-accent" />
              <Text className="text-sm font-medium text-accent">
                {photos.uploading ? "Uploading…" : photos.mediaUrls.length > 0 ? "Add another slide" : "Add photos"}
              </Text>
            </Pressable>
            <Text className={`text-xs ${contentCounterClass(content.length)}`}>
              {content.length}/{CONTENT_LIMIT}
            </Text>
          </View>

          {photos.uploadError ? <Text className="mt-2 text-sm text-danger">{photos.uploadError}</Text> : null}

          <View className="mt-6">
            <TopicPicker selected={topicIds} onToggle={toggleTopic} />
          </View>

          {error ? (
            <Text accessibilityRole="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">
              {error}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View className="flex-row items-center justify-between border-t border-border bg-canvas px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} className="p-1">
          <Icon as={X} size={22} className="text-ink-muted" />
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSave || saving}
          accessibilityRole="button"
          className={`rounded-full bg-accent px-5 py-2 ${!canSave || saving ? "opacity-50" : "active:bg-accent-hover"}`}
        >
          <Text className="text-sm font-medium text-canvas">{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
