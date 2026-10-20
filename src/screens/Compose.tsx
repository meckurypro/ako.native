// src/screens/Compose.tsx
// Write a post: optional heading (+ colour), body with @mentions and formatting,
// up to 4 photos, optional tagged project / music, up to 5 topics. Posts as you
// or — in Page mode — as the active Page (not switchable mid-draft on purpose).
// "…" offers Save as draft / Schedule. Can resume a draft or scheduled post.
import { Image as ImageIcon, Link2, Music as MusicIcon, MoreHorizontal, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { AddMusicSheet } from "@/components/music/AddMusicSheet";
import { HeadingColorPicker } from "@/components/post/HeadingColorPicker";
import { MentionTextarea } from "@/components/post/MentionTextarea";
import { MAX_TOPICS, TopicPicker } from "@/components/post/TopicPicker";
import { SchedulePostModal } from "@/components/post/SchedulePostModal";
import { TagProjectPicker } from "@/components/post/TagProjectPicker";
import { Avatar } from "@/components/ui/Avatar";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { useToast } from "@/components/ui/Toast";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { PageActionBlocked } from "@/components/page/PageActionBlocked";
import { useActiveIdentity, useActivePagePermissions } from "@/hooks/usePages";
import { useCreatePost, useDeleteDraftOrScheduledPost } from "@/hooks/usePosts";
import { useMyProfile } from "@/hooks/useProfile";
import { useReturnAfterSave } from "@/hooks/useReturnAfterSave";
import { useSmartBack } from "@/hooks/useSmartBack";
import { setJustPosted } from "@/lib/justPosted";
import { setJustSaved } from "@/lib/justSaved";
import { formatScheduleShort } from "@/lib/schedulePresets";
import { isVideoUrl, useUploadPostMedia } from "@/hooks/useUploadPostMedia";
import { fromImagePickerAsset } from "@/lib/localFile";
import { supabase } from "@/lib/supabase";
import { CONTENT_LIMIT, contentCounterClass, postContentLimit } from "@/lib/textLimits";
import type { MusicSearchResult } from "@/types/music";
import { useTheme } from "@/theme/ThemeProvider";

const HEADING_LIMIT = 50;
const MAX_MEDIA_FILES = 4;

export function Compose() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const detailsY = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // With the keyboard up, the details box gets exactly the room between the top of the screen and the
  // action bar above the keyboard (minus the formatting toolbar and some breathing room) and scrolls
  // internally past that — so the caret is never hidden and tapping places it where you touch.
  // Hidden keyboard → no cap, the box simply grows and the page scrolls as before.
  const ACTION_BAR = 64 + Math.max(insets.bottom, 12) - 12;
  const detailsMaxHeight =
    keyboardHeight > 0 ? Math.max(140, windowHeight - keyboardHeight - insets.top - ACTION_BAR - 56 - 24) : undefined;
  const smartBack = useSmartBack();
  const returnAfterSave = useReturnAfterSave();
  const toast = useToast();
  const params = useLocalSearchParams<{
    draftId?: string;
    scheduledId?: string;
    taggedProjectId?: string;
    taggedProjectTitle?: string;
    attachMusicCatalogueId?: string;
  }>();

  const [heading, setHeading] = useState("");
  const [headingColor, setHeadingColor] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set());
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [taggedProject, setTaggedProject] = useState<{ id: string; title: string } | null>(
    params.taggedProjectId ? { id: params.taggedProjectId, title: params.taggedProjectTitle ?? "Project" } : null
  );
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  // Optional soundtrack — either picked via AddMusicSheet in this session (attachedMusic has full
  // display info), or arriving from the discovery sheet's "Use in my post" (id only).
  const [attachedMusic, setAttachedMusic] = useState<MusicSearchResult | null>(null);
  const [musicCatalogueId, setMusicCatalogueId] = useState<string | null>(params.attachMusicCatalogueId ?? null);
  // Only gates the entry point for attaching NEW music — a post that already has music keeps its chip
  // (so it can be removed) even if the flag flips off mid-session.
  const musicInPostsEnabled = useFeatureFlag("music_in_posts_enabled");
  const [addMusicOpen, setAddMusicOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const moreButtonRef = useRef<View>(null);

  const createPost = useCreatePost();
  const deleteDraftOrScheduled = useDeleteDraftOrScheduledPost();
  const uploadMedia = useUploadPostMedia();
  const { data: identity } = useActiveIdentity();
  const { data: me } = useMyProfile();

  const resumingPostId = params.draftId ?? params.scheduledId ?? null;
  const resumedPostIdRef = useRef(resumingPostId);
  const resumingKind = params.scheduledId ? "scheduled post" : "draft";

  // Resuming a draft / scheduled post: load it into the form once.
  useEffect(() => {
    if (!resumingPostId) return;
    (async () => {
      const { data, error: fetchError } = await supabase
        .from("posts")
        .select("heading, heading_color, content, media_urls, tagged_project:projects!posts_tagged_project_id_fkey(id, title), post_topics(interest_id)")
        .eq("id", resumingPostId)
        .single();
      if (fetchError || !data) {
        toast(`Couldn't load that ${resumingKind}.`, { variant: "error" });
        return;
      }
      setHeading(data.heading ?? "");
      setHeadingColor(data.heading_color ?? null);
      setContent(data.content ?? "");
      setMediaUrls(data.media_urls ?? []);
      const resumedTopics = (data as unknown as { post_topics: { interest_id: string }[] | null }).post_topics;
      if (resumedTopics?.length) setTopicIds(new Set(resumedTopics.map((row) => row.interest_id)));
      const resumedProject = (data as unknown as { tagged_project: { id: string; title: string } | null }).tagged_project;
      if (resumedProject) setTaggedProject({ id: resumedProject.id, title: resumedProject.title });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postingAsPage = identity?.mode === "page" ? identity.page : null;
  // Verified personal accounts get the longer cap; page posts keep the standard one.
  const contentLimit = postingAsPage ? CONTENT_LIMIT : postContentLimit(me?.is_verified);
  const pagePerms = useActivePagePermissions();
  const canPost = heading.trim().length > 0 || content.trim().length > 0;
  const busy = !canPost || createPost.isPending;

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

  async function handleAddPhotos() {
    const remaining = MAX_MEDIA_FILES - mediaUrls.length;
    if (remaining <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (result.canceled) return;

    if (mediaUrls.length + result.assets.length > MAX_MEDIA_FILES) {
      setUploadError(`You can attach up to ${MAX_MEDIA_FILES} files.`);
      return;
    }
    setUploadError(null);

    for (const asset of result.assets) {
      try {
        const url = await uploadMedia.mutateAsync(fromImagePickerAsset(asset));
        setMediaUrls((prev) => [...prev, url]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed.");
        break;
      }
    }
  }

  async function submitPost(status: "published" | "draft" | "scheduled", scheduledFor?: string) {
    if (!canPost) return;
    setError(null);

    try {
      const createdPost = await createPost.mutateAsync({
        heading: heading.trim() || undefined,
        heading_color: headingColor,
        content,
        interest_ids: Array.from(topicIds),
        media_urls: mediaUrls,
        posted_as_page_id: postingAsPage?.id,
        tagged_project_id: taggedProject?.id,
        music_catalogue_id: musicCatalogueId ?? undefined,
        ...(status !== "published" ? { status, scheduled_for: scheduledFor } : {}),
      });

      // Resuming a draft/scheduled post: the new row replaces it.
      if (resumedPostIdRef.current) deleteDraftOrScheduled.mutate(resumedPostIdRef.current);

      // Every outcome lands the person where the post now lives, so they see it straight away - never back on
      // this editor, and never on whichever screen happened to open it (e.g. Notifications' "+" button).
      const createdId = (createdPost as { id: string }).id;
      if (status === "draft") {
        setJustSaved("draft", createdId);
        toast("Saved to your drafts.", { variant: "success" });
        router.replace("/activity/drafts" as Href);
      } else if (status === "scheduled") {
        setJustSaved("scheduled", createdId);
        toast(scheduledFor ? `Scheduled for ${formatScheduleShort(new Date(scheduledFor))}.` : "Scheduled - it'll post automatically.", { variant: "success" });
        router.replace("/activity/scheduled" as Href);
      } else if (postingAsPage) {
        // A Page's posts live on the Page's own profile (already newest-first).
        toast("Posted.", { variant: "success" });
        router.replace(`/page/${postingAsPage.username}` as Href);
      } else {
        // Personal posts live on the Feed. The create-post hook already refetched feed / profile lists, and the
        // hint lets Feed pin this exact post at the top of "For You" as it comes into view.
        setJustPosted(createdId);
        toast("Posted.", { variant: "success" });
        await returnAfterSave({ landOn: "/feed" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't post this.";
      setError(message);
      toast(message, { variant: "error" });
    }
  }

  function handleConfirmSchedule(when: Date) {
    setScheduleModalOpen(false);
    void submitPost("scheduled", when.toISOString());
  }

  const moreMenuItems: DropdownMenuItem[] = [
    { key: "draft", label: "Save as draft", onSelect: () => void submitPost("draft"), disabled: !canPost },
    { key: "schedule", label: "Schedule…", onSelect: () => setScheduleModalOpen(true), disabled: !canPost },
  ];

  if (postingAsPage && !pagePerms.loading && !pagePerms.can("create_posts")) {
    return <PageActionBlocked pageName={postingAsPage.name} action="create posts" />;
  }

  return (
    <KeyboardAvoider className="flex-1 bg-canvas">
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: keyboardHeight > 0 ? 320 : 32 }}
      >
        <View className="w-full max-w-xl self-center">
          {/* Who this posts as — reflects account mode. Not editable from here on purpose:
              switch mode first, then compose, so there's no chance of posting as the wrong identity. */}
          <View className="mb-4 flex-row items-center gap-2">
            <Avatar
              src={postingAsPage ? postingAsPage.avatar_url : me?.avatar_url}
              name={postingAsPage ? postingAsPage.name : me?.display_name ?? "You"}
              size="sm"
            />
            <Text className="flex-1 text-sm text-ink-muted">
              Posting as <Text className="font-medium text-ink">{postingAsPage ? postingAsPage.name : me?.display_name}</Text>
              {!postingAsPage ? (
                <>
                  {" · "}
                  <TextLink href="/pages" className="text-accent">
                    switch
                  </TextLink>
                </>
              ) : null}
            </Text>
          </View>

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
              style={{ fontFamily: "Fraunces_600SemiBold", paddingVertical: 0 }}
            />
            {/* Only worth showing once there's something to colour. */}
            {heading.trim().length > 0 ? (
              <View className="pt-1.5">
                <HeadingColorPicker value={headingColor} onChange={setHeadingColor} />
              </View>
            ) : null}
          </View>
          <Text className="mb-3 text-xs text-ink-muted">
            {heading.length}/{HEADING_LIMIT}
          </Text>

          <View onLayout={(e) => (detailsY.current = e.nativeEvent.layout.y)}>
          <MentionTextarea
            value={content}
            onChange={setContent}
            maxLength={contentLimit}
            rows={8}
            maxInputHeight={detailsMaxHeight}
            // Bring the toolbar + box to the top of the visible area so the whole space above the keyboard is the editor.
            onFocus={() => setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, detailsY.current + insets.top + 16 - 8), animated: true }), 120)}
            placeholder="Add details… use @ to mention someone."
            showFormatToolbar
          />
          </View>

          {mediaUrls.length > 0 ? (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {mediaUrls.map((url) => (
                <View key={url} className="aspect-square overflow-hidden rounded-xl bg-surface" style={{ width: "48.5%" }}>
                  {isVideoUrl(url) ? null : <Image source={{ uri: url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />}
                  <Pressable
                    onPress={() => setMediaUrls((prev) => prev.filter((u) => u !== url))}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    hitSlop={8}
                    className="absolute right-1.5 top-1.5 rounded-full bg-ink-a60 p-1"
                  >
                    <Icon as={X} size={14} className="text-canvas" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {/* Tagged project — Personal mode only (a Page's own projects aren't listed by useUserProjects). */}
          {!postingAsPage ? (
            <View className="mt-3 flex-row">
              {taggedProject ? (
                <View className="flex-row items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-3 pr-1.5">
                  <Pressable onPress={() => setShowProjectPicker(true)} accessibilityRole="button" accessibilityLabel="Change tagged project" className="flex-row items-center gap-1.5">
                    <Icon as={Link2} size={13} className="shrink-0 text-ink-muted" />
                    <Text numberOfLines={1} className="max-w-[220px] text-sm text-ink">
                      {taggedProject.title}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setTaggedProject(null)} accessibilityRole="button" accessibilityLabel="Remove tagged project" hitSlop={8} className="p-1">
                    <Icon as={X} size={13} className="text-ink-muted" />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setShowProjectPicker(true)} accessibilityRole="button" className="flex-row items-center gap-1.5">
                  <Icon as={Link2} size={15} className="text-accent" />
                  <Text className="text-sm font-medium text-accent">Tag a project</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          <View className="mt-3 flex-row items-center justify-between">
            <Pressable
              onPress={handleAddPhotos}
              disabled={uploadMedia.isPending || mediaUrls.length >= MAX_MEDIA_FILES}
              accessibilityRole="button"
              className={`flex-row items-center gap-1.5 ${uploadMedia.isPending || mediaUrls.length >= MAX_MEDIA_FILES ? "opacity-50" : ""}`}
            >
              <Icon as={ImageIcon} size={18} className="text-accent" />
              <Text className="text-sm font-medium text-accent">
                {uploadMedia.isPending ? "Uploading…" : mediaUrls.length > 0 ? "Add another slide" : "Add photos"}
              </Text>
            </Pressable>
            <Text className={`text-xs ${contentCounterClass(content.length, contentLimit)}`}>
              {content.length}/{contentLimit}
            </Text>
          </View>

          {uploadError ? <Text className="mt-2 text-sm text-danger">{uploadError}</Text> : null}

          {musicInPostsEnabled || musicCatalogueId ? (
            <View className="mt-6">
              {musicCatalogueId ? (
                <View className="flex-row items-center justify-between rounded-xl bg-accent-soft px-3 py-2">
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-accent">
                    ♫ {attachedMusic?.title ?? "Music attached"}
                    {attachedMusic ? <Text className="text-ink-muted">{` · ${attachedMusic.primary_artist_name}`}</Text> : null}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setMusicCatalogueId(null);
                      setAttachedMusic(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove music"
                    hitSlop={8}
                    className="p-1"
                  >
                    <Icon as={X} size={14} className="text-ink-muted" />
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setAddMusicOpen(true)} accessibilityRole="button" className="flex-row items-center gap-2">
                  <Icon as={MusicIcon} size={16} className="text-ink-muted" />
                  <Text className="text-sm font-medium text-ink-muted">Add music</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {addMusicOpen ? (
            <AddMusicSheet
              onSelect={(song) => {
                setMusicCatalogueId(song.id);
                setAttachedMusic(song);
                setAddMusicOpen(false);
              }}
              onClose={() => setAddMusicOpen(false)}
            />
          ) : null}

          <View className="mt-6">
            <TopicPicker selected={topicIds} onToggle={toggleTopic} />
          </View>

          {error ? (
            <Text accessibilityRole="alert" className="mt-4 rounded-xl bg-danger-a10 p-3 text-sm text-danger">
              {error}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Action bar — stays at the bottom, riding above the keyboard. */}
      <View
        className="flex-row items-center justify-between border-t border-border bg-canvas px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} className="p-1">
          <Icon as={X} size={22} className="text-ink-muted" />
        </Pressable>
        <View className="flex-row items-center gap-2">
          <View ref={moreButtonRef} collapsable={false}>
            <Pressable
              onPress={() => setMoreMenuOpen(true)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="More posting options"
              hitSlop={8}
              className={`p-2 ${busy ? "opacity-40" : ""}`}
            >
              <Icon as={MoreHorizontal} size={20} className="text-ink-muted" />
            </Pressable>
          </View>
          <Pressable
            onPress={() => void submitPost("published")}
            disabled={busy}
            accessibilityRole="button"
            className={`rounded-full bg-accent px-5 py-2 ${busy ? "opacity-50" : "active:bg-accent-hover"}`}
          >
            <Text className="text-sm font-medium text-canvas">{createPost.isPending ? "Posting…" : "Post"}</Text>
          </Pressable>
        </View>
      </View>

      {showProjectPicker && me ? (
        <TagProjectPicker
          userId={me.id}
          onSelect={(id, title) => {
            setTaggedProject({ id, title });
            setShowProjectPicker(false);
          }}
          onClose={() => setShowProjectPicker(false)}
        />
      ) : null}

      {moreMenuOpen ? <DropdownMenu anchorRef={moreButtonRef} items={moreMenuItems} onClose={() => setMoreMenuOpen(false)} width={192} /> : null}

      {scheduleModalOpen ? <SchedulePostModal onClose={() => setScheduleModalOpen(false)} onConfirm={handleConfirmSchedule} /> : null}
    </KeyboardAvoider>
  );
}
