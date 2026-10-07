// src/screens/CreateProject.tsx
// New project: thumbnail → who it posts as → title → type (which changes the
// rest of the form) → description → topics → type-specific block → price/promo
// → privacy → publish. Which types you see depends on personal vs Page mode,
// admin switches and your eligibility. Course / authored Book / Room are
// created as drafts you finish building afterwards.
import { Image as ImageIcon } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MentionTextarea } from "@/components/post/MentionTextarea";
import { MAX_TOPICS, TopicPicker } from "@/components/post/TopicPicker";
import { BookFields, EMPTY_BOOK_FIELDS, type BookFieldsValue } from "@/components/project-types/BookFields";
import { CourseFields } from "@/components/project-types/CourseFields";
import { EMPTY_EVENT_FIELDS, EventFields, type EventFieldsValue } from "@/components/project-types/EventFields";
import { EMPTY_FILE_FIELDS, FileFields, type FileFieldsValue } from "@/components/project-types/FileFields";
import { EMPTY_GIG_FIELDS, GigFields, type GigFieldsValue } from "@/components/project-types/GigFields";
import { EMPTY_MEDIA_FIELDS, MediaFields, mediaFieldsAreValid, type MediaFieldsValue } from "@/components/project-types/MediaFields";
import { EMPTY_MEETING_FIELDS, MeetingFields, type MeetingFieldsValue } from "@/components/project-types/MeetingFields";
import { EMPTY_PITCH_FIELDS, PitchFields, type PitchFieldsValue } from "@/components/project-types/PitchFields";
import { EMPTY_ROOM_FIELDS, RoomFields, type RoomFieldsValue } from "@/components/project-types/RoomFields";
import { EMPTY_URL_FIELDS, UrlFields, type UrlFieldsValue } from "@/components/project-types/UrlFields";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { PrivacyToggle } from "@/components/ui/PrivacyToggle";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SelectField } from "@/components/ui/SelectField";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { useToast } from "@/components/ui/Toast";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useActiveIdentity } from "@/hooks/usePages";
import { useMyProfile } from "@/hooks/useProfile";
import {
  PROJECT_TYPE_HINTS,
  PROJECT_TYPE_LABELS,
  getProjectTypeEligibility,
  getVisibleProjectTypes,
  useActiveProjectTypes,
  useCreatePitchProject,
  useCreateProject,
  useMyEligibilityStats,
  useMyProjectTypeExemption,
  useProjectTypeAccessRules,
  type ProjectType,
} from "@/hooks/useProjects";
import { useUploadProjectThumbnail } from "@/hooks/useUploadProjectThumbnail";
import { pickSingleImage } from "@/lib/pickImage";
import { CONTENT_LIMIT, contentCounterClass } from "@/lib/textLimits";

export function CreateProject() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const createProject = useCreateProject();
  const createPitchProject = useCreatePitchProject();
  const uploadThumbnail = useUploadProjectThumbnail();
  const projectsEnabled = useFeatureFlag("projects_enabled");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("file");
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set());
  const [priceUsd, setPriceUsd] = useState("0");
  const [showPromo, setShowPromo] = useState(false);
  const [promoPriceUsd, setPromoPriceUsd] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailRatio, setThumbnailRatio] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fixed at open (switch account mode FIRST, then create) — same rule as composing a post.
  const { data: identity } = useActiveIdentity();
  const { data: me } = useMyProfile();
  const postingAsPage = identity?.mode === "page" ? identity.page : null;

  const { data: typeSettings } = useActiveProjectTypes();
  const { data: accessRules } = useProjectTypeAccessRules();
  const { data: myStats } = useMyEligibilityStats();
  const { data: isExempt } = useMyProjectTypeExemption();

  const allowedTypes = getVisibleProjectTypes(postingAsPage ? "page" : "personal", typeSettings, accessRules, myStats, isExempt);
  const eligibility = getProjectTypeEligibility(projectType, accessRules, myStats, isExempt);

  // If the current pick isn't offered in this mode, fall back to the first one that is.
  useEffect(() => {
    if (allowedTypes.length > 0 && !allowedTypes.includes(projectType)) setProjectType(allowedTypes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postingAsPage?.id, typeSettings, accessRules, myStats, isExempt]);

  // Per-type field state is kept separately so switching type never discards what was entered.
  const [fileFields, setFileFields] = useState<FileFieldsValue>(EMPTY_FILE_FIELDS);
  const [urlFields, setUrlFields] = useState<UrlFieldsValue>(EMPTY_URL_FIELDS);
  const [mediaFields, setMediaFields] = useState<MediaFieldsValue>(EMPTY_MEDIA_FIELDS);
  const [eventFields, setEventFields] = useState<EventFieldsValue>(EMPTY_EVENT_FIELDS);
  const [meetingFields, setMeetingFields] = useState<MeetingFieldsValue>(EMPTY_MEETING_FIELDS);
  const [gigFields, setGigFields] = useState<GigFieldsValue>(EMPTY_GIG_FIELDS);
  const [pitchFields, setPitchFields] = useState<PitchFieldsValue>(EMPTY_PITCH_FIELDS);
  const [roomFields, setRoomFields] = useState<RoomFieldsValue>(EMPTY_ROOM_FIELDS);
  const [bookFields, setBookFields] = useState<BookFieldsValue>(EMPTY_BOOK_FIELDS);

  // Crediting someone else's book forces it free.
  useEffect(() => {
    if (projectType === "book" && !bookFields.is_own_work && priceUsd !== "0") {
      setPriceUsd("0");
      setShowPromo(false);
      setPromoPriceUsd("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectType, bookFields.is_own_work]);

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

  async function handleThumbnailSelect() {
    const file = await pickSingleImage();
    if (!file) return;
    try {
      const { url, width, height } = await uploadThumbnail.mutateAsync(file);
      setThumbnailUrl(url);
      setThumbnailRatio({ width, height });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thumbnail upload failed.");
    }
  }

  function validateTypeSpecific(): string | null {
    if (projectType === "file" && !fileFields.file_path) return "Upload a file to continue.";
    if (projectType === "url" && !urlFields.url.trim()) return "Add the link you're sharing access to.";
    if (projectType === "media" && !mediaFieldsAreValid(mediaFields)) {
      if (!mediaFields.audio.enabled && !mediaFields.video.enabled && !mediaFields.image.enabled) return "Turn on Audio, Video, Image, or any combination.";
      return "Add a link or upload a file for each channel you turned on.";
    }
    if (projectType === "event" && !eventFields.location_value.trim()) return eventFields.location_type === "physical" ? "Add the event address." : "Add the join link.";
    if (projectType === "meeting" && !meetingFields.scheduled_at) return "Set when this meeting happens.";
    if (projectType === "gig" && !gigFields.role_id) return "Select the professional role this gig represents.";
    if (projectType === "gig" && !gigFields.tagline.trim()) return "Add a short tagline for this gig.";
    if (projectType === "pitch") {
      const goal = parseFloat(pitchFields.goal_amount_usd);
      if (!pitchFields.goal_amount_usd.trim() || Number.isNaN(goal) || goal <= 0) return "Set a fundraising goal above $0.";
    }
    if (projectType === "room" && roomFields.start_date && roomFields.end_date && new Date(roomFields.end_date) <= new Date(roomFields.start_date)) {
      return "End date needs to be after the start date.";
    }
    if (projectType === "book" && bookFields.content_source !== "authored") {
      if (bookFields.content_source === "link" && !bookFields.url.trim()) return "Add the link to the book or article.";
      if (bookFields.content_source === "upload" && !bookFields.file_path) return "Upload a PDF to continue.";
      if (bookFields.content_source === "upload" && !bookFields.allow_download && !bookFields.allow_read_in_app) return "Allow download, in-app reading, or both.";
      if (!bookFields.is_own_work && !bookFields.source_credit.trim()) return "Credit the original author or source.";
      if (!bookFields.is_own_work && !bookFields.author_name.trim()) return "Add the author's name.";
    }
    return null;
  }

  function goToCreated() {
    toast(`${title.trim()} created successfully.`, { variant: "success" });
    if (postingAsPage) router.replace(`/page/${postingAsPage.username}?tab=projects` as Href);
    else if (me?.username) router.replace(`/profile/${me.username}?tab=projects` as Href);
    else router.back();
  }

  async function handleSubmit() {
    setError(null);
    if (!title.trim()) return setError("Title is required.");

    const price = parseFloat(priceUsd) || 0;
    const typeError = validateTypeSpecific();
    if (typeError) return setError(typeError);
    if (eligibility && !eligibility.eligible) return setError(eligibility.reasons[0]);

    if (projectType === "pitch") {
      try {
        await createPitchProject.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          thumbnail_url: thumbnailUrl ?? undefined,
          thumbnail_width: thumbnailRatio?.width,
          thumbnail_height: thumbnailRatio?.height,
          is_private: isPrivate,
          posted_as_page_id: postingAsPage?.id,
          goal_amount_usd: parseFloat(pitchFields.goal_amount_usd),
          topic_ids: Array.from(topicIds),
        });
        goToCreated();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't create project.");
      }
      return;
    }

    let promoPrice: number | null = null;
    if (showPromo && promoPriceUsd.trim() !== "") {
      promoPrice = parseFloat(promoPriceUsd);
      if (Number.isNaN(promoPrice) || promoPrice < 0) return setError("Promo price must be a valid amount.");
      if (promoPrice >= price) return setError("Promo price must be lower than the actual price.");
    }

    const channelSource = (c: { file_path: string | null }) => (c.file_path ? "upload" : "link");
    const cleanFaq = gigFields.faq.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })).filter((f) => f.question && f.answer);
    const cleanDeliverables = gigFields.deliverables.map((d) => d.trim()).filter(Boolean);

    try {
      await createProject.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        project_type: projectType,
        posted_as_page_id: postingAsPage?.id,
        external_url: projectType === "url" ? urlFields.url.trim() : undefined,
        file_path: projectType === "file" ? (fileFields.file_path ?? undefined) : undefined,
        thumbnail_url: thumbnailUrl ?? undefined,
        thumbnail_width: thumbnailRatio?.width,
        thumbnail_height: thumbnailRatio?.height,
        price_usd: price,
        promo_price_usd: promoPrice,
        is_private: isPrivate,
        status: projectType === "course" || (projectType === "book" && bookFields.content_source === "authored") ? "draft" : undefined,
        topic_ids: Array.from(topicIds),
        event_details:
          projectType === "event"
            ? {
                event_date: eventFields.event_date || undefined,
                location_type: eventFields.location_type,
                location_value: eventFields.location_value.trim(),
                ticket_template_url: eventFields.ticket_template_url || undefined,
              }
            : undefined,
        meeting_details: projectType === "meeting" ? { scheduled_at: meetingFields.scheduled_at, recording_enabled: meetingFields.recording_enabled } : undefined,
        media_details:
          projectType === "media"
            ? {
                has_audio: mediaFields.audio.enabled,
                has_video: mediaFields.video.enabled,
                has_image: mediaFields.image.enabled,
                audio_source: mediaFields.audio.enabled ? channelSource(mediaFields.audio) : undefined,
                audio_url: mediaFields.audio.enabled ? mediaFields.audio.url.trim() || undefined : undefined,
                audio_file_path: mediaFields.audio.enabled ? (mediaFields.audio.file_path ?? undefined) : undefined,
                video_source: mediaFields.video.enabled ? channelSource(mediaFields.video) : undefined,
                video_url: mediaFields.video.enabled ? mediaFields.video.url.trim() || undefined : undefined,
                video_file_path: mediaFields.video.enabled ? (mediaFields.video.file_path ?? undefined) : undefined,
                image_source: mediaFields.image.enabled ? "upload" : undefined,
                image_file_path: mediaFields.image.enabled ? (mediaFields.image.file_path ?? undefined) : undefined,
              }
            : undefined,
        gig_details:
          projectType === "gig"
            ? {
                role_id: gigFields.role_id,
                tagline: gigFields.tagline.trim(),
                delivery_estimate: gigFields.delivery_estimate.trim() || undefined,
                sample_project_ids: gigFields.sample_project_ids,
                revisions_included: gigFields.revisions_included.trim() ? parseInt(gigFields.revisions_included.trim(), 10) : undefined,
                deliverables: cleanDeliverables.length > 0 ? cleanDeliverables : undefined,
                faq: cleanFaq.length > 0 ? cleanFaq : undefined,
              }
            : undefined,
        room_details:
          projectType === "room"
            ? {
                start_date: roomFields.start_date ? new Date(roomFields.start_date).toISOString() : undefined,
                end_date: roomFields.end_date ? new Date(roomFields.end_date).toISOString() : undefined,
              }
            : undefined,
        book_details:
          projectType === "book"
            ? {
                book_type: bookFields.book_type,
                content_source: bookFields.content_source,
                author_name: bookFields.author_name.trim() || undefined,
                is_own_work: bookFields.is_own_work,
                source_credit: bookFields.is_own_work ? undefined : bookFields.source_credit.trim() || undefined,
                external_url: bookFields.content_source === "link" ? bookFields.url.trim() : undefined,
                file_path: bookFields.content_source === "upload" ? (bookFields.file_path ?? undefined) : undefined,
                allow_download: bookFields.content_source === "upload" ? bookFields.allow_download : undefined,
                allow_read_in_app: bookFields.content_source === "upload" ? bookFields.allow_read_in_app : undefined,
              }
            : undefined,
      });
      goToCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create project.");
    }
  }

  if (!projectsEnabled) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="New project" />
        <Text className="px-4 text-sm text-ink-muted">New projects aren't being created right now. Check back later.</Text>
      </View>
    );
  }

  const bookNotOwn = projectType === "book" && !bookFields.is_own_work;
  const isDraftType = projectType === "course" || (projectType === "book" && bookFields.content_source === "authored");
  const submitting = projectType === "pitch" ? createPitchProject.isPending : createProject.isPending;
  const aspect = thumbnailRatio ? thumbnailRatio.width / thumbnailRatio.height : 16 / 9;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScreenHeader title="New project" />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <View className="w-full max-w-md self-center">
          {/* Thumbnail — the frame takes the uploaded image's own aspect ratio (16:9 only as the empty placeholder). */}
          <Pressable
            onPress={() => void handleThumbnailSelect()}
            accessibilityRole="button"
            accessibilityLabel="Choose thumbnail"
            className="mb-4 w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-surface"
            style={{ aspectRatio: aspect }}
          >
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
            ) : (
              <View className="items-center gap-1">
                <Icon as={ImageIcon} size={24} className="text-ink-muted" />
                <Text className="text-sm text-ink-muted">{uploadThumbnail.isPending ? "Uploading…" : "Add thumbnail"}</Text>
              </View>
            )}
          </Pressable>

          <View className="mb-4 flex-row items-center gap-2">
            <Avatar src={postingAsPage ? postingAsPage.avatar_url : me?.avatar_url} name={postingAsPage ? postingAsPage.name : (me?.display_name ?? "You")} size="sm" />
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

          <FormField label="Title" value={title} onChangeText={setTitle} />

          <View className="mb-1.5">
            <SelectField
              label="Project type"
              value={projectType}
              options={allowedTypes.map((type) => ({ value: type, label: PROJECT_TYPE_LABELS[type] }))}
              onChange={(v) => setProjectType(v as ProjectType)}
            />
          </View>
          <Text className="mb-4 text-xs text-ink-muted">
            {PROJECT_TYPE_HINTS[projectType]}
            {postingAsPage
              ? " Event, Room, and Course are page-only — that's why some types you might expect aren't listed here."
              : " Gig, Meeting, Media, and File are personal-only — switch to a page to create an Event, Room, or Course."}
          </Text>

          {eligibility && !eligibility.eligible ? (
            <View className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
              <Text className="mb-1 text-sm font-medium text-danger">You don't meet the requirements for {PROJECT_TYPE_LABELS[projectType]} yet:</Text>
              {eligibility.reasons.map((reason) => (
                <Text key={reason} className="text-xs text-danger">{`• ${reason}`}</Text>
              ))}
            </View>
          ) : null}

          <View className="mb-4">
            <Text className="mb-1.5 text-sm font-medium text-ink-muted">Description</Text>
            <MentionTextarea
              value={description}
              onChange={setDescription}
              maxLength={CONTENT_LIMIT}
              rows={3}
              showFormatToolbar
              className="rounded-xl border border-border bg-canvas px-4 py-3"
            />
            <Text className={`mt-1.5 text-right text-xs ${contentCounterClass(description.length)}`}>
              {description.length}/{CONTENT_LIMIT}
            </Text>
          </View>

          <TopicPicker selected={topicIds} onToggle={toggleTopic} />

          {/* ---- Type-specific block ---- */}
          {projectType === "media" ? <MediaFields value={mediaFields} onChange={setMediaFields} onError={setError} /> : null}
          {projectType === "file" ? <FileFields value={fileFields} onChange={setFileFields} onError={setError} /> : null}
          {projectType === "url" ? <UrlFields value={urlFields} onChange={setUrlFields} /> : null}
          {projectType === "event" ? <EventFields value={eventFields} onChange={setEventFields} /> : null}
          {projectType === "meeting" ? <MeetingFields value={meetingFields} onChange={setMeetingFields} /> : null}
          {projectType === "room" ? <RoomFields value={roomFields} onChange={setRoomFields} /> : null}
          {projectType === "course" ? <CourseFields /> : null}
          {projectType === "gig" ? <GigFields value={gigFields} onChange={setGigFields} /> : null}
          {projectType === "pitch" ? <PitchFields value={pitchFields} onChange={setPitchFields} /> : null}
          {projectType === "book" ? <BookFields value={bookFields} onChange={setBookFields} onError={setError} /> : null}

          {/* A pitch never carries a price tag — supporters pick their own amount. */}
          {projectType !== "pitch" ? (
            <>
              <FormField
                label={projectType === "gig" ? "Booking fee (USD, optional)" : "Price (USD)"}
                value={priceUsd}
                onChangeText={setPriceUsd}
                keyboardType="decimal-pad"
                editable={!bookNotOwn}
              />
              <Text className="-mt-4 mb-4 text-xs text-ink-muted">
                {projectType === "gig"
                  ? "Set to 0 to keep this message-only — people reach out, no payment upfront. Add an amount to also let people pay a booking fee to secure a slot."
                  : bookNotOwn
                    ? "Crediting someone else's work — this has to stay free."
                    : "Set to 0 for a free project."}
              </Text>

              {!bookNotOwn ? (
                <View className="mb-6">
                  <Checkbox
                    checked={showPromo}
                    onChange={(v) => {
                      setShowPromo(v);
                      if (!v) setPromoPriceUsd("");
                    }}
                    label="Add a promo price"
                  />
                  {showPromo ? (
                    <View className="mt-3">
                      <FormField label="Promo price" value={promoPriceUsd} onChangeText={setPromoPriceUsd} keyboardType="decimal-pad" placeholder="Promo price" />
                      <Text className="-mt-4 text-xs text-ink-muted">
                        Shown next to the actual price, which will appear crossed out. Must be lower than the actual price.
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}

          <PrivacyToggle checked={isPrivate} onChange={setIsPrivate} />

          {error ? (
            <Text accessibilityRole="alert" className="mb-4 text-sm text-danger">
              {error}
            </Text>
          ) : null}

          <Button onPress={() => void handleSubmit()} loading={submitting}>
            {isDraftType ? "Create draft" : projectType === "pitch" ? "Publish pitch" : "Publish project"}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
