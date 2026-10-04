// src/screens/EditPage.tsx
// Edit a Page's cover, avatar, name, tagline, bio, website and topics (admins only).
import { Camera } from "lucide-react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MentionTextarea } from "@/components/post/MentionTextarea";
import { MAX_TOPICS, TopicPicker } from "@/components/post/TopicPicker";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, Image } from "@/components/ui/styled";
import { SurfaceInput } from "@/components/ui/SurfaceInput";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { usePageByUsername, usePageMembers, usePageTopics, useUpdatePage } from "@/hooks/usePages";
import { useUploadAvatar } from "@/hooks/useUploadAvatar";
import { pickSingleImage } from "@/lib/pickImage";

export function EditPage() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: page, isLoading } = usePageByUsername(username ?? "");
  const { data: members } = usePageMembers(page?.id ?? "");
  const { data: existingTopicIds } = usePageTopics(page?.id);
  const updatePage = useUpdatePage();
  const uploadAvatar = useUploadAvatar();

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set());
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const myMembership = members?.find((m) => m.user_id === user?.id && m.status === "active");
  const isAdmin = !!myMembership?.is_admin;

  useEffect(() => {
    if (page && !hydrated) {
      setName(page.name);
      setTagline(page.tagline ?? "");
      setBio(page.bio ?? "");
      setWebsiteUrl(page.website_url ?? "");
      setAvatarUrl(page.avatar_url);
      setCoverUrl(page.cover_url);
      setHydrated(true);
    }
  }, [page, hydrated]);

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

  async function chooseImage(kind: "avatar" | "cover") {
    const file = await pickSingleImage({ aspect: kind === "avatar" ? [1, 1] : [3, 1] });
    if (!file) return;
    setError(null);
    const setBusy = kind === "avatar" ? setUploadingAvatar : setUploadingCover;
    setBusy(true);
    try {
      const url = await uploadAvatar.mutateAsync(file);
      if (kind === "avatar") setAvatarUrl(url);
      else setCoverUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!page) return;
    if (!name.trim()) return setError("Name is required.");

    try {
      await updatePage.mutateAsync({
        page_id: page.id,
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        bio: bio.trim() || undefined,
        website_url: websiteUrl.trim() || undefined,
        topic_ids: Array.from(topicIds),
        avatar_url: avatarUrl ?? undefined,
        cover_url: coverUrl ?? undefined,
      });
      router.replace(`/page/${page.username}` as Href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save those changes.");
    }
  }

  if (isLoading || !page) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="" />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-ink-muted">Only a {page.name} admin can edit its details.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScreenHeader title="Edit page" />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <View className="w-full max-w-md gap-5 self-center">
          {/* Cover */}
          <Pressable
            onPress={() => void chooseImage("cover")}
            accessibilityRole="button"
            accessibilityLabel="Change cover photo"
            className="relative aspect-[3/1] w-full items-center justify-center overflow-hidden rounded-2xl bg-surface"
          >
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
            ) : (
              <Text className="text-xs text-ink-muted">{uploadingCover ? "Uploading…" : "Add a cover photo"}</Text>
            )}
            <View className="absolute bottom-2 right-2 h-8 w-8 items-center justify-center rounded-full bg-canvas/80">
              <Icon as={Camera} size={14} className="text-ink" />
            </View>
          </Pressable>

          {/* Avatar — overlaps the cover slightly, like most profile-edit screens. */}
          <View className="-mt-12 ml-1 self-start">
            <Pressable onPress={() => void chooseImage("avatar")} accessibilityRole="button" accessibilityLabel="Change photo" className="relative">
              <Avatar src={avatarUrl} name={name || page.name} size="xl" />
              <View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-2 border-canvas bg-surface">
                <Icon as={Camera} size={12} className="text-ink" />
              </View>
            </Pressable>
            {uploadingAvatar ? <Text className="mt-1 text-xs text-ink-muted">Uploading…</Text> : null}
          </View>

          <SurfaceInput label="Name" value={name} onChangeText={setName} maxLength={80} />
          <SurfaceInput label="Tagline" value={tagline} onChangeText={setTagline} maxLength={100} />

          <View>
            <Text className="mb-1 text-xs font-medium text-ink-muted">Bio</Text>
            <MentionTextarea value={bio} onChange={setBio} maxLength={280} rows={3} className="rounded-xl bg-surface px-4 py-3 text-sm" />
          </View>

          <SurfaceInput
            label="Website"
            value={websiteUrl}
            onChangeText={setWebsiteUrl}
            placeholder="yourwebsite.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <TopicPicker selected={topicIds} onToggle={toggleTopic} />

          {error ? <Text accessibilityRole="alert" className="text-sm text-danger">{error}</Text> : null}

          <Button onPress={handleSubmit} loading={updatePage.isPending} disabled={uploadingAvatar || uploadingCover}>
            Save changes
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
