// src/screens/Compose.tsx
// Write a post: optional heading (+ colour), body with @mentions and formatting,
// up to 4 photos, optional tagged project / music, up to 5 topics. Posts as you
// or — in Page mode — as the active Page (not switchable mid-draft on purpose).
// "…" offers Save as draft / Schedule. Can resume a draft or scheduled post.
import { CalendarClock, FileText, Image as ImageIcon, Link2, Music as MusicIcon, MoreHorizontal, X } from "lucide-react-native";
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
import { ProfilePagesModal } from "@/components/profile/ProfilePagesModal";
import { SaveProgressDialog } from "@/components/ui/SaveProgressDialog";
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
import { useLeaveGuard } from "@/hooks/useLeaveGuard";
import { useSmartBack } from "@/hooks/useSmartBack";
import { setJustPostedPending } from "@/lib/justPosted";
import { setComposeRestore, peekComposeRestore, clearComposeRestore, type ComposeRestore } from "@/lib/composeRestore";
import { setJustSaved } from "@/lib/justSaved";
import { formatScheduleShort } from "@/lib/schedulePresets";
import { isVideoUrl, useUploadPostMedia } from "@/hooks/useUploadPostMedia";
import { fromImagePickerAsset } from "@/lib/localFile";
import { supabase } from "@/lib/supabase";
import { CONTENT_LIMIT, contentCounterClass, postContentLimit } from "@/lib/textLimits";
import type { MusicSearchResult } from "@/types/music";
import { useTheme } from "@/theme/ThemeProvider";
import { friendlyError } from "@/lib/friendlyError";

const HEADING_LIMIT = 50;
const MAX_MEDIA_FILES = 4;

// Everything the person can put into the form, as one comparable string. Used to tell "they've changed something
// since this screen opened (or since the draft they resumed was loaded)" from "nothing to lose" when they try to
// leave — see useLeaveGuard.
function postSignature(f: {
  heading: string;
  headingColor: string | null;
  content: string;
  mediaUrls: string[];
  topicIds: string[];
  taggedProjectId: string | null;
  musicCatalogueId: string | null;
}): string {
  return JSON.stringify([f.heading, f.headingColor, f.content, f.mediaUrls, [...f.topicIds].sort(), f.taggedProjectId, f.musicCatalogueId]);
}

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

  // Set when a post that already left for the Feed was then rejected: the form comes back as it was. Peeked (not
  // consumed) so a double render sees it too; cleared on mount below.
  const [restore] = useState(() => peekComposeRestore());
  useEffect(() => {
    clearComposeRestore();
  }, []);

  const [pagesOpen, setPagesOpen] = useState(false);
  const [heading, setHeading] = useState(restore?.heading ?? "");
  const [headingColor, setHeadingColor] = useState<string | null>(restore?.headingColor ?? null);
  const [content, setContent] = useState(restore?.content ?? "");
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set(restore?.topicIds ?? []));
  const [mediaUrls, setMediaUrls] = useState<string[]>(restore?.mediaUrls ?? []);
  const [error, setError] = useState<string | null>(restore?.error ?? null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [taggedProject, setTaggedProject] = useState<{ id: string; title: string } | null>(
    restore?.taggedProject ??
      (params.taggedProjectId ? { id: params.taggedProjectId, title: params.taggedProjectTitle ?? "Project" } : null)
  );
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  // Optional soundtrack — either picked via AddMusicSheet in this session (attachedMusic has full
  // display info), or arriving from the discovery sheet's "Use in my post" (id only).
  const [attachedMusic, setAttachedMusic] = useState<MusicSearchResult | null>(null);
  const [musicCatalogueId, setMusicCatalogueId] = useState<string | null>(restore?.musicCatalogueId ?? params.attachMusicCatalogueId ?? null);
  // Only gates the entry point for attaching NEW music — a post that already has music keeps its chip
  // (so it can be removed) even if the flag flips off mid-session.
  const musicInPostsEnabled = useFeatureFlag("music_in_posts_enabled");
  const [addMusicOpen, setAddMusicOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const moreButtonRef = useRef<View>(null);

  const createPost = useCreatePost();
  // Publishing leaves for the Feed immediately, so it must not raise the blocking overlay (see useCreatePost).
  const publishPost = useCreatePost({ blocking: false });
  const publishingRef = useRef(false);
  const deleteDraftOrScheduled = useDeleteDraftOrScheduledPost();
  const uploadMedia = useUploadPostMedia();
  const { data: identity } = useActiveIdentity();
  const { data: me } = useMyProfile();

  const resumingPostId = params.draftId ?? params.scheduledId ?? null;
  const resumedPostIdRef = useRef(restore?.resumedPostId ?? resumingPostId);
  const resumingKind = params.scheduledId ? "scheduled post" : "draft";

  // The form as it stood when it was opened — including a project/song handed in by whoever opened it, which isn't
  // the person's own progress. A resumed draft re-baselines once it has loaded (below). Leaving with the form
  // different from this is what triggers the "save your progress?" prompt.
  const baselineRef = useRef<string | null>(null);
  const signature = postSignature({
    heading,
    headingColor,
    content,
    mediaUrls,
    topicIds: Array.from(topicIds),
    taggedProjectId: taggedProject?.id ?? null,
    musicCatalogueId,
  });
  // A form handed back after a failed post is unsaved progress, not a fresh start.
  if (baselineRef.current === null) {
    baselineRef.current = restore
      ? postSignature({ heading: "", headingColor: null, content: "", mediaUrls: [], topicIds: [], taggedProjectId: null, musicCatalogueId: null })
      : signature;
  }

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
      // What was just loaded is the starting point, not unsaved progress.
      baselineRef.current = postSignature({
        heading: data.heading ?? "",
        headingColor: data.heading_color ?? null,
        content: data.content ?? "",
        mediaUrls: data.media_urls ?? [],
        topicIds: (resumedTopics ?? []).map((row) => row.interest_id),
        taggedProjectId: resumedProject ? resumedProject.id : params.taggedProjectId ?? null,
        musicCatalogueId: params.attachMusicCatalogueId ?? null,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postingAsPage = identity?.mode === "page" ? identity.page : null;
  // Verified personal accounts get the longer cap; page posts keep the standard one.
  const contentLimit = postingAsPage ? CONTENT_LIMIT : postContentLimit(me?.is_verified);
  const pagePerms = useActivePagePermissions();
  const canPost = heading.trim().length > 0 || content.trim().length > 0;

  // Leaving with unsaved progress asks first (save as a draft / discard). Hooks stay above the early return below.
  const leaveGuard = useLeaveGuard(signature !== baselineRef.current);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const busy = !canPost || createPost.isPending || publishPost.isPending;

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
        setUploadError(friendlyError(err, "Upload failed."));
        break;
      }
    }
  }

  // What create-post is sent for any outcome — post now, draft, or scheduled.
  function postInput(status: "published" | "draft" | "scheduled", scheduledFor?: string) {
    return {
      heading: heading.trim() || undefined,
      heading_color: headingColor,
      content,
      interest_ids: Array.from(topicIds),
      media_urls: mediaUrls,
      posted_as_page_id: postingAsPage?.id,
      tagged_project_id: taggedProject?.id,
      music_catalogue_id: musicCatalogueId ?? undefined,
      ...(status !== "published" ? { status, scheduled_for: scheduledFor } : {}),
    };
  }

  // Awaited (it used to be fire-and-forget) so a failed cleanup is seen instead of silently leaving the stale draft.
  async function removeOriginalDraft() {
    if (!resumedPostIdRef.current) return;
    try {
      await deleteDraftOrScheduled.mutateAsync(resumedPostIdRef.current);
    } catch (cleanupErr) {
      console.error("Couldn't remove the original draft after saving", cleanupErr);
      toast("Saved, but the old draft couldn't be removed. Delete it from Drafts.", { variant: "error" });
    }
  }

  // Publishing: the person is on the Feed (For You) the instant they tap Post. The server round trip (moderation,
  // insert, fetching the new post) finishes in the background, and Feed pins the post when its id arrives. If the
  // post is rejected, the form is handed back through composeRestore and the person returns to the editor with
  // everything they typed and the reason shown - so they never lose their words, and never wait on a spinner.
  function publishInBackground() {
    if (publishingRef.current) return;
    publishingRef.current = true;
    setError(null);

    const input = postInput("published");
    const resumedId = resumedPostIdRef.current;
    const snapshot: ComposeRestore = {
      heading,
      headingColor,
      content,
      mediaUrls,
      topicIds: Array.from(topicIds),
      taggedProject,
      musicCatalogueId,
      resumedPostId: resumedId,
      error: null,
    };
    const removeOriginal = deleteDraftOrScheduled.mutateAsync;

    // Shown on the Feed while the post finishes, and swapped for the outcome the moment it is known.
    const posting = toast("Posting…", { variant: "loading" });

    const result: Promise<string | null> = publishPost
      .mutateAsync(input)
      .then(async (createdPost) => {
        // Resuming a draft/scheduled post: the new row replaces it.
        if (resumedId) {
          try {
            await removeOriginal(resumedId);
          } catch (cleanupErr) {
            console.error("Couldn't remove the original draft after saving", cleanupErr);
            toast("Saved, but the old draft couldn't be removed. Delete it from Drafts.", { variant: "error" });
          }
        }
        posting.dismiss();
        toast("Posted.", { variant: "success" });
        return (createdPost as { id: string }).id;
      })
      .catch((err) => {
        // Moderation rejections and other edge-function errors surface here - the message is already short and
        // direct. Reopen the editor with the form exactly as it was.
        const message = friendlyError(err, "Couldn't post this.");
        posting.dismiss();
        toast(message, { variant: "error" });
        setComposeRestore({ ...snapshot, error: message });
        router.push("/compose" as Href);
        return null;
      });

    setJustPostedPending(result);
    // Posted from here is the person finishing, not walking away from unsaved work.
    leaveGuard.allowLeaving();
    // Always land on the Feed (everything above it in the stack is dismissed), whichever screen opened Compose
    // (e.g. Notifications' "+" button). Feed resets to For You when it sees the pending post.
    void returnAfterSave({ landOn: "/feed" });
  }

  async function submitPost(status: "published" | "draft" | "scheduled", scheduledFor?: string) {
    if (!canPost) return;
    if (status === "published") {
      publishInBackground();
      return;
    }
    setError(null);

    try {
      const createdPost = await createPost.mutateAsync(postInput(status, scheduledFor));

      // Resuming a draft/scheduled post: the new row replaces it.
      await removeOriginalDraft();

      // Saved or published — the redirect below is the person finishing, not walking away from unsaved work.
      leaveGuard.allowLeaving();

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
      }
    } catch (err) {
      const message = friendlyError(err, "Couldn't post this.");
      setError(message);
      toast(message, { variant: "error" });
    }
  }

  // "Save draft" from the leave prompt: same draft the "Save as draft" menu item makes, and the same landing: the Drafts list. If the save is rejected (moderation, no
  // connection) they stay on the form with everything intact, and the reason is shown.
  async function handleLeaveSave() {
    if (!canPost || leaveSaving) return;
    setLeaveSaving(true);
    setError(null);
    try {
      const savedDraft = await createPost.mutateAsync(postInput("draft"));
      await removeOriginalDraft();
      setJustSaved("draft", (savedDraft as { id: string }).id);
      toast("Saved to your drafts.", { variant: "success" });
      // Like "Save as draft" from the menu: the draft is the outcome, so the person lands on their Drafts.
      leaveGuard.allowLeaving();
      router.replace("/activity/drafts" as Href);
    } catch (err) {
      const message = friendlyError(err, "Couldn't save this draft.");
      setError(message);
      toast(message, { variant: "error" });
      leaveGuard.stay();
    } finally {
      setLeaveSaving(false);
    }
  }

  function handleConfirmSchedule(when: Date) {
    setScheduleModalOpen(false);
    void submitPost("scheduled", when.toISOString());
  }

  const moreMenuItems: DropdownMenuItem[] = [
    { key: "draft", label: "Save as draft", icon: <Icon as={FileText} size={22} className="text-overlay-ink" />, onSelect: () => void submitPost("draft"), disabled: !canPost },
    { key: "schedule", label: "Schedule…", icon: <Icon as={CalendarClock} size={22} className="text-overlay-ink" />, onSelect: () => setScheduleModalOpen(true), disabled: !canPost },
  ];

  if (postingAsPage && !pagePerms.loading && !pagePerms.can("create_posts")) {
    return <PageActionBlocked pageName={postingAsPage.name} action="create posts" />;
  }

  return (
    <KeyboardAvoider className="flex-1 bg-canvas">
      <ScrollView showsHorizontalScrollIndicator={false}
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        // "on-drag" would dismiss the keyboard (and drop the text selection) the moment the page scrolls; keep it up while editing.
        keyboardDismissMode="none"
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
                  <TextLink onPress={() => setPagesOpen(true)} className="text-accent">
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
            className={`rounded-full bg-cta px-5 py-2 ${busy ? "opacity-50" : "active:opacity-85"}`}
          >
            <Text className="text-sm font-medium text-white">{createPost.isPending || publishPost.isPending ? "Posting…" : "Post"}</Text>
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

      {moreMenuOpen ? <DropdownMenu title="Post options" anchorRef={moreButtonRef} items={moreMenuItems} onClose={() => setMoreMenuOpen(false)} width={192} /> : null}

      {pagesOpen ? <ProfilePagesModal mode="owner" navigateOnSwitch={false} onClose={() => setPagesOpen(false)} /> : null}

      {leaveGuard.isBlocked ? (
        <SaveProgressDialog
          description={
            resumingPostId
              ? `Save your changes as a draft to finish later, or discard them. The ${resumingKind} you opened stays as it was if you discard.`
              : "Save this post as a draft to finish later, or discard it."
          }
          saveDisabled={!canPost}
          saveHint="Add a heading or some details to save it as a draft."
          saving={leaveSaving}
          onSave={() => void handleLeaveSave()}
          onDiscard={leaveGuard.proceed}
          onKeepEditing={leaveGuard.stay}
        />
      ) : null}
      {scheduleModalOpen ? <SchedulePostModal onClose={() => setScheduleModalOpen(false)} onConfirm={handleConfirmSchedule} /> : null}
    </KeyboardAvoider>
  );
}
