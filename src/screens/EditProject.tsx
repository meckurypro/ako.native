// src/screens/EditProject.tsx
// Edit an existing project. The type is fixed after creation (each type owns
// its own details table and member data); everything else — status, thumbnail,
// text, topics, the type's own fields, price/promo, affiliate program, custom
// URL, privacy and access — can change.
import { Image as ImageIcon } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MentionTextarea } from "@/components/post/MentionTextarea";
import { MAX_TOPICS, TopicPicker } from "@/components/post/TopicPicker";
import { AffiliateProgramSheet } from "@/components/project/AffiliateProgramSheet";
import { ManageAccessSheet } from "@/components/project/ManageAccessSheet";
import { ProjectLinkSheet } from "@/components/project/ProjectLinkSheet";
import { BookFields, EMPTY_BOOK_FIELDS, type BookFieldsValue } from "@/components/project-types/BookFields";
import { EMPTY_EVENT_FIELDS, EventFields, type EventFieldsValue } from "@/components/project-types/EventFields";
import { EMPTY_FILE_FIELDS, FileFields, type FileFieldsValue } from "@/components/project-types/FileFields";
import { EMPTY_GIG_FIELDS, GigFields, type GigFieldsValue } from "@/components/project-types/GigFields";
import { EMPTY_MEDIA_FIELDS, MediaFields, mediaFieldsAreValid, type MediaFieldsValue } from "@/components/project-types/MediaFields";
import { EMPTY_MEETING_FIELDS, MeetingFields, type MeetingFieldsValue } from "@/components/project-types/MeetingFields";
import { EMPTY_PITCH_FIELDS, PitchFields, type PitchFieldsValue } from "@/components/project-types/PitchFields";
import { EMPTY_ROOM_FIELDS, RoomFields, type RoomFieldsValue } from "@/components/project-types/RoomFields";
import { EMPTY_URL_FIELDS, UrlFields, type UrlFieldsValue } from "@/components/project-types/UrlFields";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { PrivacyToggle } from "@/components/ui/PrivacyToggle";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAffiliateProgram } from "@/hooks/useAffiliates";
import { useRoomDetails } from "@/hooks/useRoom";
import { useBookDetails, useEventDetails, useGigDetails, useGigSamples, useMediaDetails, useMeetingDetails, usePitchDetails } from "@/hooks/useProjectTypeDetails";
import { PROJECT_TYPE_LABELS, useProject, useProjectTopics, useUpdateProject, type ProjectStatus } from "@/hooks/useProjects";
import { useUploadProjectThumbnail } from "@/hooks/useUploadProjectThumbnail";
import { isoToLocalInput } from "@/lib/dateInput";
import { pickSingleImage } from "@/lib/pickImage";
import { supabase } from "@/lib/supabase";
import { CONTENT_LIMIT, contentCounterClass } from "@/lib/textLimits";

const STATUS_OPTIONS: { value: ProjectStatus; label: string; hint: string }[] = [
  { value: "active", label: "Published", hint: "Visible to everyone" },
  { value: "draft", label: "Draft", hint: "Only visible to you, not published yet" },
  { value: "archived", label: "Archived", hint: "Hidden — was published before" },
];

export function EditProject() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const insets = useSafeAreaInsets();

  const { data: project, isLoading } = useProject(projectId);
  const [manageAccessOpen, setManageAccessOpen] = useState(false);
  const [affiliateSheetOpen, setAffiliateSheetOpen] = useState(false);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  const { data: affiliateProgram } = useAffiliateProgram(project && project.project_type !== "pitch" ? project.id : undefined);
  const { data: existingTopicIds } = useProjectTopics(projectId);
  const { data: existingEventDetails } = useEventDetails(project?.project_type === "event" ? projectId : undefined);
  const { data: existingMeetingDetails } = useMeetingDetails(project?.project_type === "meeting" ? projectId : undefined);
  const { data: existingMediaDetails } = useMediaDetails(project?.project_type === "media" ? projectId : undefined);
  const { data: existingGigDetails } = useGigDetails(project?.project_type === "gig" ? projectId : undefined);
  const { data: existingGigSamples } = useGigSamples(project?.project_type === "gig" ? projectId : undefined);
  const { data: existingPitchDetails } = usePitchDetails(project?.project_type === "pitch" ? projectId : undefined);
  const { data: existingRoomDetails } = useRoomDetails(project?.project_type === "room" ? projectId : undefined);
  const { data: existingBookDetails } = useBookDetails(project?.project_type === "book" ? projectId : undefined);
  const updateProject = useUpdateProject();
  const uploadThumbnail = useUploadProjectThumbnail();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set());
  const [priceUsd, setPriceUsd] = useState("0");
  const [showPromo, setShowPromo] = useState(false);
  const [promoPriceUsd, setPromoPriceUsd] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [isPrivate, setIsPrivate] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailRatio, setThumbnailRatio] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [topicsHydrated, setTopicsHydrated] = useState(false);

  const [fileFields, setFileFields] = useState<FileFieldsValue>(EMPTY_FILE_FIELDS);
  const [urlFields, setUrlFields] = useState<UrlFieldsValue>(EMPTY_URL_FIELDS);
  const [mediaFields, setMediaFields] = useState<MediaFieldsValue>(EMPTY_MEDIA_FIELDS);
  const [eventFields, setEventFields] = useState<EventFieldsValue>(EMPTY_EVENT_FIELDS);
  const [meetingFields, setMeetingFields] = useState<MeetingFieldsValue>(EMPTY_MEETING_FIELDS);
  const [gigFields, setGigFields] = useState<GigFieldsValue>(EMPTY_GIG_FIELDS);
  const [pitchFields, setPitchFields] = useState<PitchFieldsValue>(EMPTY_PITCH_FIELDS);
  const [roomFields, setRoomFields] = useState<RoomFieldsValue>(EMPTY_ROOM_FIELDS);
  const [bookFields, setBookFields] = useState<BookFieldsValue>(EMPTY_BOOK_FIELDS);
  const [typeDetailsHydrated, setTypeDetailsHydrated] = useState(false);

  // Crediting someone else's book forces it free.
  useEffect(() => {
    if (project?.project_type === "book" && !bookFields.is_own_work && priceUsd !== "0") {
      setPriceUsd("0");
      setShowPromo(false);
      setPromoPriceUsd("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.project_type, bookFields.is_own_work]);

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

  useEffect(() => {
    if (existingTopicIds && !topicsHydrated) {
      setTopicIds(new Set(existingTopicIds));
      setTopicsHydrated(true);
    }
  }, [existingTopicIds, topicsHydrated]);

  useEffect(() => {
    if (project && !hydrated) {
      setTitle(project.title);
      setDescription(project.description ?? "");
      setPriceUsd(String(project.price_usd));
      setStatus(project.status === "cancelled" ? "archived" : project.status);
      setIsPrivate(project.is_private);
      setThumbnailUrl(project.thumbnail_url);
      if (project.thumbnail_width && project.thumbnail_height) setThumbnailRatio({ width: project.thumbnail_width, height: project.thumbnail_height });
      if (project.project_type === "file") setFileFields({ file_path: project.file_path, file_name: null });
      if (project.project_type === "url") setUrlFields({ url: project.external_url ?? "" });
      if (project.promo_price_usd !== null) {
        setShowPromo(true);
        setPromoPriceUsd(String(project.promo_price_usd));
      }
      setHydrated(true);
    }
  }, [project, hydrated]);

  // Type-specific details load from their own tables; the form can't render until the right one has arrived.
  useEffect(() => {
    if (!project || typeDetailsHydrated) return;
    const t = project.project_type;
    if (t === "event" && existingEventDetails) {
      setEventFields({
        event_date: isoToLocalInput(existingEventDetails.event_date),
        location_type: existingEventDetails.location_type,
        location_value: existingEventDetails.location_value,
        ticket_template_url: existingEventDetails.ticket_template_url ?? "",
      });
      setTypeDetailsHydrated(true);
    } else if (t === "meeting" && existingMeetingDetails) {
      setMeetingFields({ scheduled_at: isoToLocalInput(existingMeetingDetails.scheduled_at), recording_enabled: existingMeetingDetails.recording_enabled });
      setTypeDetailsHydrated(true);
    } else if (t === "media" && existingMediaDetails) {
      setMediaFields({
        audio: { enabled: existingMediaDetails.has_audio, url: existingMediaDetails.audio_url ?? "", file_path: existingMediaDetails.audio_file_path, file_name: null },
        video: { enabled: existingMediaDetails.has_video, url: existingMediaDetails.video_url ?? "", file_path: existingMediaDetails.video_file_path, file_name: null },
        image: { enabled: existingMediaDetails.has_image, url: "", file_path: existingMediaDetails.image_file_path, file_name: null },
      });
      setTypeDetailsHydrated(true);
    } else if (t === "gig" && existingGigDetails !== undefined && existingGigSamples) {
      setGigFields({
        role_id: existingGigDetails?.role_id ?? "",
        tagline: existingGigDetails?.tagline ?? "",
        delivery_estimate: existingGigDetails?.delivery_estimate ?? "",
        sample_project_ids: existingGigSamples.map((p) => p.id),
        revisions_included: existingGigDetails?.revisions_included?.toString() ?? "",
        deliverables: existingGigDetails?.deliverables ?? [],
        faq: existingGigDetails?.faq ?? [],
      });
      setTypeDetailsHydrated(true);
    } else if (t === "pitch" && existingPitchDetails) {
      setPitchFields({ goal_amount_usd: String(existingPitchDetails.goal_amount_usd) });
      setTypeDetailsHydrated(true);
    } else if (t === "room" && existingRoomDetails !== undefined) {
      setRoomFields({ start_date: isoToLocalInput(existingRoomDetails?.start_date), end_date: isoToLocalInput(existingRoomDetails?.end_date) });
      setTypeDetailsHydrated(true);
    } else if (t === "book" && existingBookDetails !== undefined) {
      setBookFields({
        book_type: existingBookDetails?.book_type ?? "book",
        content_source: existingBookDetails?.content_source ?? "upload",
        url: existingBookDetails?.external_url ?? "",
        file_path: existingBookDetails?.file_path ?? null,
        file_name: null,
        allow_download: existingBookDetails?.allow_download ?? false,
        allow_read_in_app: existingBookDetails?.allow_read_in_app ?? true,
        is_own_work: existingBookDetails?.is_own_work ?? true,
        author_name: existingBookDetails?.author_name ?? "",
        source_credit: existingBookDetails?.source_credit ?? "",
      });
      setTypeDetailsHydrated(true);
    } else if (!["event", "meeting", "media", "gig", "pitch", "room", "book"].includes(t)) {
      setTypeDetailsHydrated(true);
    }
  }, [project, existingEventDetails, existingMeetingDetails, existingMediaDetails, existingGigDetails, existingGigSamples, existingPitchDetails, existingRoomDetails, existingBookDetails, typeDetailsHydrated]);

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
    if (!project) return null;
    const t = project.project_type;
    if (t === "file" && !fileFields.file_path) return "Upload a file to continue.";
    if (t === "url" && !urlFields.url.trim()) return "Add the link you're sharing access to.";
    if (t === "media" && !mediaFieldsAreValid(mediaFields)) {
      if (!mediaFields.audio.enabled && !mediaFields.video.enabled && !mediaFields.image.enabled) return "Turn on Audio, Video, Image, or any combination.";
      return "Add a link or upload a file for each channel you turned on.";
    }
    if (t === "event" && !eventFields.location_value.trim()) return eventFields.location_type === "physical" ? "Add the event address." : "Add the join link.";
    if (t === "meeting" && !meetingFields.scheduled_at) return "Set when this meeting happens.";
    if (t === "gig" && !gigFields.role_id) return "Select the professional role this gig represents.";
    if (t === "gig" && !gigFields.tagline.trim()) return "Add a short tagline for this gig.";
    if (t === "pitch") {
      const goal = parseFloat(pitchFields.goal_amount_usd);
      if (!pitchFields.goal_amount_usd.trim() || Number.isNaN(goal) || goal <= 0) return "Set a fundraising goal above $0.";
    }
    if (t === "room" && roomFields.start_date && roomFields.end_date && new Date(roomFields.end_date) <= new Date(roomFields.start_date)) return "End date needs to be after the start date.";
    if (t === "book" && bookFields.content_source !== "authored") {
      if (bookFields.content_source === "link" && !bookFields.url.trim()) return "Add the link to the book or article.";
      if (bookFields.content_source === "upload" && !bookFields.file_path) return "Upload a PDF to continue.";
      if (bookFields.content_source === "upload" && !bookFields.allow_download && !bookFields.allow_read_in_app) return "Allow download, in-app reading, or both.";
      if (!bookFields.is_own_work && !bookFields.source_credit.trim()) return "Credit the original author or source.";
    }
    return null;
  }

  async function handleSubmit() {
    setError(null);
    if (!projectId || !project) return;
    if (!title.trim()) return setError("Title is required.");

    const t = project.project_type;
    const price = t === "pitch" ? 0 : parseFloat(priceUsd) || 0;
    const typeError = validateTypeSpecific();
    if (typeError) return setError(typeError);

    let promoPrice: number | null = null;
    if (t !== "pitch" && showPromo && promoPriceUsd.trim() !== "") {
      promoPrice = parseFloat(promoPriceUsd);
      if (Number.isNaN(promoPrice) || promoPrice < 0) return setError("Promo price must be a valid amount.");
      if (promoPrice >= price) return setError("Promo price must be lower than the actual price.");
    }

    try {
      await updateProject.mutateAsync({
        id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        project_type: t,
        external_url: t === "url" ? urlFields.url.trim() || null : project.external_url,
        file_path: t === "file" ? fileFields.file_path : project.file_path,
        thumbnail_url: thumbnailUrl,
        thumbnail_width: thumbnailRatio?.width ?? null,
        thumbnail_height: thumbnailRatio?.height ?? null,
        price_usd: price,
        promo_price_usd: promoPrice,
        status,
        is_private: isPrivate,
        topic_ids: Array.from(topicIds),
      });

      const fail = (e: unknown) => {
        if (e) throw e;
      };

      if (t === "event") {
        const { error: e } = await supabase
          .from("project_event_details")
          .update({
            event_date: eventFields.event_date ? new Date(eventFields.event_date).toISOString() : null,
            location_type: eventFields.location_type,
            location_value: eventFields.location_value.trim(),
            ticket_template_url: eventFields.ticket_template_url || null,
          })
          .eq("project_id", projectId);
        fail(e);
      }
      if (t === "meeting") {
        const { error: e } = await supabase
          .from("project_meeting_details")
          .update({ scheduled_at: new Date(meetingFields.scheduled_at).toISOString(), recording_enabled: meetingFields.recording_enabled })
          .eq("project_id", projectId);
        fail(e);
      }
      if (t === "media") {
        const { error: e } = await supabase.from("project_media_details").upsert({
          project_id: projectId,
          has_audio: mediaFields.audio.enabled,
          has_video: mediaFields.video.enabled,
          has_image: mediaFields.image.enabled,
          audio_source: mediaFields.audio.enabled ? (mediaFields.audio.file_path ? "upload" : "link") : null,
          audio_url: mediaFields.audio.enabled ? mediaFields.audio.url.trim() || null : null,
          audio_file_path: mediaFields.audio.enabled ? mediaFields.audio.file_path : null,
          video_source: mediaFields.video.enabled ? (mediaFields.video.file_path ? "upload" : "link") : null,
          video_url: mediaFields.video.enabled ? mediaFields.video.url.trim() || null : null,
          video_file_path: mediaFields.video.enabled ? mediaFields.video.file_path : null,
          image_source: mediaFields.image.enabled ? "upload" : null,
          image_url: null,
          image_file_path: mediaFields.image.enabled ? mediaFields.image.file_path : null,
        });
        fail(e);
      }
      if (t === "gig") {
        const revisions = gigFields.revisions_included.trim();
        const deliverables = gigFields.deliverables.map((d) => d.trim()).filter(Boolean);
        const faq = gigFields.faq.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })).filter((f) => f.question && f.answer);
        const { error: e } = await supabase.from("project_gig_details").upsert({
          project_id: projectId,
          role_id: gigFields.role_id,
          tagline: gigFields.tagline.trim(),
          delivery_estimate: gigFields.delivery_estimate.trim() || null,
          revisions_included: revisions ? parseInt(revisions, 10) : null,
          deliverables: deliverables.length > 0 ? deliverables : null,
          faq: faq.length > 0 ? faq : null,
          is_complete: true,
        });
        fail(e);

        const { error: delErr } = await supabase.from("project_gig_samples").delete().eq("gig_project_id", projectId);
        fail(delErr);
        if (gigFields.sample_project_ids.length > 0) {
          const rows = gigFields.sample_project_ids.map((sample_project_id, i) => ({ gig_project_id: projectId, sample_project_id, sort_order: i }));
          const { error: insErr } = await supabase.from("project_gig_samples").insert(rows);
          fail(insErr);
        }
      }
      if (t === "pitch") {
        const { error: e } = await supabase.from("project_pitch_details").update({ goal_amount_usd: parseFloat(pitchFields.goal_amount_usd) }).eq("project_id", projectId);
        fail(e);
      }
      if (t === "room") {
        const { error: e } = await supabase.from("project_room_details").upsert({
          project_id: projectId,
          start_date: roomFields.start_date ? new Date(roomFields.start_date).toISOString() : null,
          end_date: roomFields.end_date ? new Date(roomFields.end_date).toISOString() : null,
        });
        fail(e);
      }
      if (t === "book") {
        const { error: e } = await supabase.from("project_book_details").upsert({
          project_id: projectId,
          book_type: bookFields.book_type,
          content_source: bookFields.content_source,
          author_name: bookFields.author_name.trim() || null,
          is_own_work: bookFields.is_own_work,
          source_credit: bookFields.is_own_work ? null : bookFields.source_credit.trim() || null,
          external_url: bookFields.content_source === "link" ? bookFields.url.trim() : null,
          file_path: bookFields.content_source === "upload" ? bookFields.file_path : null,
          allow_download: bookFields.content_source === "upload" ? bookFields.allow_download : false,
          allow_read_in_app: bookFields.content_source === "upload" ? bookFields.allow_read_in_app : true,
        });
        fail(e);
      }

      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    }
  }

  if (isLoading || !project || !typeDetailsHydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  const t = project.project_type;
  const bookNotOwn = t === "book" && !bookFields.is_own_work;
  const aspect = thumbnailRatio ? thumbnailRatio.width / thumbnailRatio.height : 16 / 9;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScreenHeader title="Edit project" />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <View className="w-full max-w-md self-center">
          <View className="mb-6">
            <Text className="mb-1.5 text-sm font-medium text-ink-muted">Status</Text>
            <View className="gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setStatus(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: status === opt.value }}
                  className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${status === opt.value ? "border-accent bg-accent-soft" : "border-border bg-canvas"}`}
                >
                  <View className={`h-4 w-4 items-center justify-center rounded-full border ${status === opt.value ? "border-accent" : "border-ink-muted/50"}`}>
                    {status === opt.value ? <View className="h-2 w-2 rounded-full bg-accent" /> : null}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-ink">{opt.label}</Text>
                    <Text className="text-xs text-ink-muted">{opt.hint}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => void handleThumbnailSelect()}
            accessibilityRole="button"
            accessibilityLabel="Change thumbnail"
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

          <FormField label="Title" value={title} onChangeText={setTitle} />

          {/* Fixed after creation — each type has its own details table and member data; changing it here would orphan that. */}
          <View className="mb-4">
            <Text className="mb-1.5 text-sm font-medium text-ink-muted">Project type</Text>
            <Text className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink-muted">{PROJECT_TYPE_LABELS[t]} — can't be changed after creation</Text>
          </View>

          <View className="mb-4">
            <Text className="mb-1.5 text-sm font-medium text-ink-muted">Description</Text>
            <MentionTextarea value={description} onChange={setDescription} maxLength={CONTENT_LIMIT} rows={3} showFormatToolbar className="rounded-xl border border-border bg-canvas px-4 py-3" />
            <Text className={`mt-1.5 text-right text-xs ${contentCounterClass(description.length)}`}>
              {description.length}/{CONTENT_LIMIT}
            </Text>
          </View>

          <TopicPicker selected={topicIds} onToggle={toggleTopic} />

          {t === "media" ? <MediaFields value={mediaFields} onChange={setMediaFields} onError={setError} /> : null}
          {t === "file" ? <FileFields value={fileFields} onChange={setFileFields} onError={setError} /> : null}
          {t === "url" ? <UrlFields value={urlFields} onChange={setUrlFields} /> : null}
          {t === "event" ? <EventFields value={eventFields} onChange={setEventFields} /> : null}
          {t === "meeting" ? <MeetingFields value={meetingFields} onChange={setMeetingFields} /> : null}
          {t === "room" ? (
            <>
              <RoomFields value={roomFields} onChange={setRoomFields} />
              <Text className="-mt-2 mb-4 text-xs text-ink-muted">Manage lectures, chat, meetings, and assignments from the cohort itself.</Text>
            </>
          ) : null}
          {t === "course" ? <Text className="mb-4 text-xs text-ink-muted">Manage modules and lessons from the course builder.</Text> : null}
          {t === "gig" ? (
            <>
              {existingGigDetails?.is_complete === false ? (
                <View className="mb-4 rounded-xl border border-accent/30 bg-accent-soft p-3">
                  <Text className="text-sm font-medium text-ink">Finish setting up this Gig</Text>
                  <Text className="mt-0.5 text-xs text-ink-muted">
                    {existingGigDetails.source === "auto_collaboration" ? "This was started automatically from a collaboration you were credited on." : "This Gig isn't complete yet."}{" "}
                    Review the details below and save to publish it to your profile.
                  </Text>
                </View>
              ) : null}
              <GigFields value={gigFields} onChange={setGigFields} excludeProjectId={project.id} />
            </>
          ) : null}
          {t === "pitch" ? <PitchFields value={pitchFields} onChange={setPitchFields} /> : null}
          {t === "book" ? (
            <>
              <BookFields value={bookFields} onChange={setBookFields} onError={setError} />
              {bookFields.content_source === "authored" ? <Text className="-mt-2 mb-4 text-xs text-ink-muted">Manage chapters from the book builder.</Text> : null}
            </>
          ) : null}

          {t !== "pitch" ? (
            <>
              <FormField label={t === "gig" ? "Booking fee (USD, optional)" : "Price (USD)"} value={priceUsd} onChangeText={setPriceUsd} keyboardType="decimal-pad" editable={!bookNotOwn} />
              <Text className="-mt-4 mb-4 text-xs text-ink-muted">
                {t === "gig"
                  ? "Set to 0 to keep this message-only. Add an amount to also let people pay a booking fee to secure a slot."
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
                      <Text className="-mt-4 text-xs text-ink-muted">Shown next to the actual price, which will appear crossed out. Must be lower than the actual price.</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}

          {/* Pitches have no sale for a commission to attach to. Free projects are blocked too — read off the live form
              value so this updates before Save — unless a program already exists (so it can still be turned off). */}
          {t !== "pitch" ? (
            (parseFloat(priceUsd) || 0) > 0 || !!affiliateProgram ? (
              <Pressable onPress={() => setAffiliateSheetOpen(true)} accessibilityRole="button" className="mb-6 px-1">
                <Text className="text-sm font-medium text-accent">Affiliate program →</Text>
              </Pressable>
            ) : (
              <Text className="mb-6 px-1 text-sm text-ink-muted">Affiliate program — set a price above to enable this.</Text>
            )
          ) : null}

          <Pressable onPress={() => setLinkSheetOpen(true)} accessibilityRole="button" className="mb-6 px-1">
            <Text className="text-sm font-medium text-accent">{project.slug ? "Custom URL →" : "Choose your custom URL →"}</Text>
          </Pressable>

          <PrivacyToggle checked={isPrivate} onChange={setIsPrivate} />
          {isPrivate ? (
            <Pressable onPress={() => setManageAccessOpen(true)} accessibilityRole="button" className="-mt-4 mb-6 px-1">
              <Text className="text-sm font-medium text-accent">Manage who has access →</Text>
            </Pressable>
          ) : null}

          {error ? (
            <Text accessibilityRole="alert" className="mb-4 text-sm text-danger">
              {error}
            </Text>
          ) : null}

          <Button onPress={() => void handleSubmit()} loading={updateProject.isPending}>
            Save changes
          </Button>
        </View>
      </ScrollView>

      {manageAccessOpen ? <ManageAccessSheet projectId={project.id} projectTitle={project.title} onClose={() => setManageAccessOpen(false)} /> : null}
      {affiliateSheetOpen ? (
        <AffiliateProgramSheet projectId={project.id} projectTitle={project.title} priceUsd={parseFloat(priceUsd) || 0} onClose={() => setAffiliateSheetOpen(false)} />
      ) : null}
      {linkSheetOpen ? <ProjectLinkSheet project={project} onClose={() => setLinkSheetOpen(false)} /> : null}
    </KeyboardAvoidingView>
  );
}
