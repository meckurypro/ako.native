// src/screens/EditPage.tsx
// Edit a Page's banner, avatar, name, tagline, bio, website, topics and hero slides (admins, or members allowed to edit).
import { Camera, MoreHorizontal, Trash2 } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { MentionTextarea } from "@/components/post/MentionTextarea";
import { MAX_TOPICS, TopicPicker } from "@/components/post/TopicPicker";
import { PageHeroEditor } from "@/components/page/PageHeroEditor";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, Image } from "@/components/ui/styled";
import { SurfaceInput } from "@/components/ui/SurfaceInput";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useReturnAfterSave } from "@/hooks/useReturnAfterSave";
import { useToast } from "@/components/ui/Toast";
import {
  useDeletePage,
  useMyPagePermissions,
  usePageByUsername,
  usePageMembers,
  usePageTopics,
  useResolvePageOwner,
  useUpdatePage,
} from "@/hooks/usePages";
import { BANNER_ASPECT, normalizeWebsite } from "@/hooks/usePageLanding";
import { useUploadAvatar } from "@/hooks/useUploadAvatar";
import { cropToAspect } from "@/lib/cropImage";
import { pickSingleImage } from "@/lib/pickImage";

export function EditPage() {
  const { username, section } = useLocalSearchParams<{ username: string; section?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: page, isLoading } = usePageByUsername(username ?? "");
  const { data: members } = usePageMembers(page?.id ?? "");
  const { data: existingTopicIds } = usePageTopics(page?.id);
  const updatePage = useUpdatePage();
  const returnAfterSave = useReturnAfterSave();
  const toast = useToast();
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
  // Admins, or a member an admin granted "edit page details" to.
  const { data: myPagePerms, isLoading: permsLoading } = useMyPagePermissions(page?.id);
  const canEdit = isAdmin || !!myPagePerms?.permissions.edit_page;
  // Deleting a page is deliberately tucked away down here, not on the page itself. Only the resolved owner
  // (the creator, or their successor) can do it — the RPC enforces the same.
  const { data: pageOwnerId } = useResolvePageOwner(page?.id ?? "", isAdmin);
  const isOwnerOfPage = isAdmin && !!user && pageOwnerId === user.id;
  const deletePage = useDeletePage();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const heroY = useRef<number | null>(null);
  const scrolledToHero = useRef(false);

  // Arrived from the page's "…" menu → "Hero slides": bring that section into view once it has been laid out.
  function maybeScrollToHero() {
    if (section !== "hero" || scrolledToHero.current || heroY.current === null) return;
    scrolledToHero.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(heroY.current - 8, 0), animated: true });
  }

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
    const picked = await pickSingleImage({ aspect: kind === "avatar" ? [1, 1] : [8, 3] });
    if (!picked) return;
    setError(null);
    const setBusy = kind === "avatar" ? setUploadingAvatar : setUploadingCover;
    setBusy(true);
    try {
      // The banner is cropped to its exact shape first, so what's previewed is what visitors see.
      const file = kind === "cover" ? await cropToAspect(picked, BANNER_ASPECT, { maxWidth: 1600 }) : picked;
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

    // A page has exactly one website. Blank clears it; anything else must be a real address.
    const website = normalizeWebsite(websiteUrl);
    if (websiteUrl.trim() && !website) return setError("That website address doesn't look right. Try something like yourwebsite.com.");

    try {
      await updatePage.mutateAsync({
        page_id: page.id,
        name: name.trim(),
        tagline: tagline.trim() || null,
        bio: bio.trim() || null,
        website_url: website,
        topic_ids: Array.from(topicIds),
        avatar_url: avatarUrl ?? undefined,
        cover_url: coverUrl,
      });
      toast("Page updated.", { variant: "success" });
      await returnAfterSave({ fallback: `/page/${page.username}` });
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

  if (!canEdit) {
    if (permsLoading) return null;
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="" />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-ink-muted">You don't have permission to edit {page.name}'s details.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoider className="flex-1 bg-canvas">
      <ScreenHeader
        title="Edit page"
        right={
          // Destructive actions live behind this, not on the page — nobody should hit Delete while looking for Save.
          isOwnerOfPage ? (
            <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="More options" hitSlop={8} className="h-9 w-9 items-center justify-center rounded-full active:opacity-70">
              <Icon as={MoreHorizontal} size={22} className="text-ink-muted" />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView ref={scrollRef} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <View className="w-full max-w-md gap-5 self-center">
          {/* Banner — like a YouTube / Facebook cover: a wide image across the top of the page. */}
          <View>
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-xs font-medium text-ink-muted">Banner</Text>
              {coverUrl ? (
                <Pressable onPress={() => setCoverUrl(null)} accessibilityRole="button" accessibilityLabel="Remove banner" hitSlop={8} className="flex-row items-center gap-1">
                  <Icon as={Trash2} size={12} className="text-danger" />
                  <Text className="text-xs text-danger">Remove</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => void chooseImage("cover")}
              accessibilityRole="button"
              accessibilityLabel="Change banner"
              className="relative w-full items-center justify-center overflow-hidden rounded-2xl bg-surface"
              style={{ aspectRatio: BANNER_ASPECT }}
            >
              {coverUrl ? (
                <Image source={{ uri: coverUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
              ) : (
                <Text className="text-xs text-ink-muted">{uploadingCover ? "Uploading…" : "Add a banner"}</Text>
              )}
              <View className="absolute bottom-2 right-2 h-8 w-8 items-center justify-center rounded-full bg-canvas-a80">
                <Icon as={Camera} size={14} className="text-ink" />
              </View>
            </Pressable>
            <Text className="mt-1 text-xs text-ink-muted">Wide image, cropped to fit. Around 1600 × 600 works best.</Text>
          </View>

          {/* Avatar — overlaps the banner slightly, like most profile-edit screens. */}
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

          {/* Every change here saves by itself — separate from the page details above. */}
          <View
            className="mt-4 border-t border-border pt-6"
            onLayout={(e) => {
              heroY.current = e.nativeEvent.layout.y;
              maybeScrollToHero();
            }}
          >
            <PageHeroEditor page={page} />
          </View>
        </View>
      </ScrollView>

      {/* Save — always at the bottom, always in reach. */}
      <View className="border-t border-border bg-canvas px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <View className="w-full max-w-md self-center">
          <Button onPress={handleSubmit} loading={updatePage.isPending} disabled={uploadingAvatar || uploadingCover}>
            Save changes
          </Button>
        </View>
      </View>

      {menuOpen ? (
        <DropdownMenu
          title="More options"
          onClose={() => setMenuOpen(false)}
          items={[
            {
              key: "delete",
              label: "Delete page",
              icon: <Icon as={Trash2} size={22} className="text-danger" />,
              variant: "danger",
              onSelect: () => setShowDeleteConfirm(true),
            },
          ]}
        />
      ) : null}

      {showDeleteConfirm ? (
        <ConfirmDialog
          title="Delete this page?"
          description={`${page.name} will disappear from search and everyone's feed. This can't be undone from here.`}
          confirmLabel="Delete"
          onConfirm={() => {
            setShowDeleteConfirm(false);
            deletePage.mutate(page.id, { onSuccess: () => router.replace("/me") });
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      ) : null}
    </KeyboardAvoider>
  );
}
