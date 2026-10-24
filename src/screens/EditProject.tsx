// src/screens/EditProject.tsx
// Edit an existing project. The type is fixed after creation (each type owns
// its own details table and member data); everything else — status, thumbnail,
// text, topics, the type's own fields, price/promo, affiliate program, custom
// URL, privacy and access — can change.
import { FileFolderHero } from "@/components/project/FileFolderArt";
import { BOOK_COVER_ERROR, BOOK_COVER_RATIO, isBookCoverRatio } from "@/lib/bookCover";
import { Banknote, CircleDot, Eye, EyeOff, Image as ImageIcon, Link2, Lock, Percent, Ticket, Type, Users } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { MentionTextarea } from "@/components/post/MentionTextarea";
import { MAX_TOPICS, TopicPicker } from "@/components/post/TopicPicker";
import { AffiliateProgramSheet } from "@/components/project/AffiliateProgramSheet";
import { GuestPassSheet } from "@/components/project/GuestPassSheet";
import { ManageAccessSheet } from "@/components/project/ManageAccessSheet";
import { ProjectLinkSheet } from "@/components/project/ProjectLinkSheet";
import { BookFields, EMPTY_BOOK_FIELDS, type BookFieldsValue } from "@/components/project-types/BookFields";
import { EMPTY_EVENT_FIELDS, EventFields, type EventFieldsValue } from "@/components/project-types/EventFields";
import {
  EMPTY_FILE_FIELDS,
  FileFields,
  fileFieldsError,
  fileFieldsFromProjectFiles,
  fileFieldsToInputs,
  type FileFieldsValue,
} from "@/components/project-types/FileFields";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { useMyProfile } from "@/hooks/useProfile";
import { useProjectFiles, useSaveProjectFiles } from "@/hooks/useProjectFiles";
import { maxProjectFiles } from "@/lib/fileProject";
import { EMPTY_GIG_FIELDS, GigFields, type GigFieldsValue } from "@/components/project-types/GigFields";
import { EMPTY_MEDIA_FIELDS, MediaFields, mediaFieldsAreValid, type MediaFieldsValue } from "@/components/project-types/MediaFields";
import { EMPTY_MEETING_FIELDS, MeetingFields, type MeetingFieldsValue } from "@/components/project-types/MeetingFields";
import { EMPTY_PITCH_FIELDS, PitchFields, type PitchFieldsValue } from "@/components/project-types/PitchFields";
import { EMPTY_ROOM_FIELDS, RoomFields, type RoomFieldsValue } from "@/components/project-types/RoomFields";
import { EMPTY_URL_FIELDS, UrlFields, type UrlFieldsValue } from "@/components/project-types/UrlFields";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { ToggleRow } from "@/components/settings/SettingsParts";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAffiliateProgram } from "@/hooks/useAffiliates";
import { useProjectOwnership } from "@/hooks/useProjectOwnership";
import { useReturnAfterSave } from "@/hooks/useReturnAfterSave";
import { useToast } from "@/components/ui/Toast";
import { useRoomDetails } from "@/hooks/useRoom";
import { useBookDetails, useEventDetails, useGigDetails, useGigSamples, useMediaDetails, useMeetingDetails, usePitchDetails } from "@/hooks/useProjectTypeDetails";
import { PROJECT_TYPE_LABELS, useProject, useProjectTopics, useUpdateProject, type ProjectStatus } from "@/hooks/useProjects";
import { useUploadProjectThumbnail } from "@/hooks/useUploadProjectThumbnail";
import { isoToLocalInput } from "@/lib/dateInput";
import { ProjectStatusSelect } from "@/components/project/ProjectStatusSelect";
import {
  FormFooter,
  FormSection,
  LinkRow,
  PricingFields,
  PROJECT_TYPE_ICONS,
  ThumbnailPicker,
} from "@/components/project/ProjectFormParts";
import { pickSingleImage } from "@/lib/pickImage";
import { supabase } from "@/lib/supabase";
import { CONTENT_LIMIT, contentCounterClass } from "@/lib/textLimits";

export function EditProject() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const insets = useSafeAreaInsets();

  const { data: project, isLoading } = useProject(projectId);
  // File projects: the saved files (one slot each), and how many this account may hold (1, or 6 if verified).
  const { data: me } = useMyProfile();
  const restricted = useIsRestricted();
  const maxFiles = maxProjectFiles(!!me?.is_verified && !restricted);
  const { data: existingFiles } = useProjectFiles(projectId, project?.project_type === "file");
  const saveProjectFiles = useSaveProjectFiles();
  const ownership = useProjectOwnership();
  const [manageAccessOpen, setManageAccessOpen] = useState(false);
  const [affiliateSheetOpen, setAffiliateSheetOpen] = useState(false);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  const [guestPassOpen, setGuestPassOpen] = useState(false);
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
  const returnAfterSave = useReturnAfterSave();
  const toast = useToast();
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
  const [supportingImageUrls, setSupportingImageUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [topicsHydrated, setTopicsHydrated] = useState(false);

  const [fileFields, setFileFields] = useState<FileFieldsValue>(EMPTY_FILE_FIELDS);
  const [fileUploading, setFileUploading] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
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
      setSupportingImageUrls(project.supporting_image_urls ?? []);
      if (project.thumbnail_width && project.thumbnail_height) setThumbnailRatio({ width: project.thumbnail_width, height: project.thumbnail_height });
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
    } else if (t === "file" && existingFiles) {
      setFileFields(fileFieldsFromProjectFiles(existingFiles));
      setTypeDetailsHydrated(true);
    } else if (!["event", "meeting", "media", "gig", "pitch", "room", "book", "file"].includes(t)) {
      setTypeDetailsHydrated(true);
    }
  }, [project, existingEventDetails, existingMeetingDetails, existingMediaDetails, existingGigDetails, existingGigSamples, existingPitchDetails, existingRoomDetails, existingBookDetails, existingFiles, typeDetailsHydrated]);

  async function handleThumbnailSelect() {
    const file = await pickSingleImage(project?.project_type === "book" ? { aspect: [2, 3] } : {});
    if (!file) return;
    try {
      const { url, width, height } = await uploadThumbnail.mutateAsync({ file, bookCover: project?.project_type === "book" });
      setThumbnailUrl(url);
      setThumbnailRatio({ width, height });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Thumbnail upload failed.");
    }
  }

  function validateTypeSpecific(): string | null {
    if (!project) return null;
    const t = project.project_type;
    if (t === "book" && thumbnailUrl && thumbnailRatio && !isBookCoverRatio(thumbnailRatio.width, thumbnailRatio.height)) return BOOK_COVER_ERROR;
    if (t === "file") {
      const fileError = fileFieldsError(fileFields);
      if (fileError) return fileError;
    }
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
    // Saving now would keep the OLD file while the new one is still going up — hold until it lands.
    if (project.project_type === "file" && fileUploading) return setError("Your file is still uploading — wait for it to finish.");
    if (project.project_type === "media" && mediaUploading) return setError("Your file is still uploading — wait for it to finish.");

    const t = project.project_type;
    // Pitches and songs are never sold (the database refuses a price on a song), so they save as free.
    const price = t === "pitch" || t === "media" ? 0 : parseFloat(priceUsd) || 0;
    const typeError = validateTypeSpecific();
    if (typeError) return setError(typeError);

    let promoPrice: number | null = null;
    if (t !== "pitch" && t !== "media" && showPromo && promoPriceUsd.trim() !== "") {
      promoPrice = parseFloat(promoPriceUsd);
      if (Number.isNaN(promoPrice) || promoPrice < 0) return setError("Promo price must be a valid amount.");
      if (promoPrice >= price) return setError("Promo price must be lower than the actual price.");
    }

    try {
      // Files first: it's the part the database can refuse (limit, ownership), so if it does, nothing else changes.
      if (t === "file") {
        await saveProjectFiles.mutateAsync({ projectId, files: fileFieldsToInputs(fileFields) });
      }
      await updateProject.mutateAsync({
        id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        project_type: t,
        external_url: t === "url" ? urlFields.url.trim() || null : project.external_url,
        // File projects: the files are saved by set_project_files above, which also keeps file_path in step.
        file_path: t === "file" ? undefined : project.file_path,
        // File projects never carry a thumbnail (the folder icon stands in) — editing one clears any old one.
        thumbnail_url: t === "file" ? null : thumbnailUrl,
        thumbnail_width: t === "file" ? null : (thumbnailRatio?.width ?? null),
        thumbnail_height: t === "file" ? null : (thumbnailRatio?.height ?? null),
        // Supporting images hang off the thumbnail — removing it clears them too.
        supporting_image_urls: t !== "file" && thumbnailUrl ? supportingImageUrls : [],
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

      // Draft/archived → published is the moment worth calling out; any other save is just "saved".
      // Either way the person goes back to the screen they opened the editor from, refreshed.
      const justPublished = project.status !== "active" && status === "active";
      const savedAsDraft = status === "draft";
      toast(justPublished ? "Project published." : savedAsDraft ? "Saved as draft." : "Changes saved.", { variant: "success" });
      // A draft is finished business on its owner's Projects tab, not on whatever screen opened the editor.
      const projectsTab = savedAsDraft && !(project.posted_as_page_id && ownership.actingAsPageId) && me?.username ? `/profile/${me.username}?tab=projects` : undefined;
      await returnAfterSave({ fallback: `/projects/${projectId}`, landOn: projectsTab });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    }
  }

  if (isLoading || !project || !typeDetailsHydrated || ownership.loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  // A Page is its own account: while acting as one, a project published from
  // the person's own profile (or another Page) is someone else's content and
  // can't be edited from here — switch accounts first. (Server RLS is still the
  // real gate; this keeps the UI from offering what it shouldn't.)
  if (!ownership.isOwner(project)) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6">
        <Text className="text-center text-ink-muted">
          {ownership.actingAsPageId
            ? "This project wasn't published by the Page you're acting as. Switch to the account that published it to edit it."
            : "You can't edit this project."}
        </Text>
        <Button onPress={() => router.back()}>Go back</Button>
      </View>
    );
  }

  const t = project.project_type;
  const bookNotOwn = t === "book" && !bookFields.is_own_work;
  const isBook = project?.project_type === "book";
  const aspect = isBook ? BOOK_COVER_RATIO : thumbnailRatio ? thumbnailRatio.width / thumbnailRatio.height : 16 / 9;

  return (
    <KeyboardAvoider className="flex-1 bg-canvas">
      <ScreenHeader title="Edit project" />
      <ScrollView showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        <View className="w-full max-w-md gap-3 self-center">
          <FormSection icon={CircleDot} title="Status" description="Whether people can find and open it.">
            <View className="mb-4">
              <ProjectStatusSelect value={status} onChange={setStatus} />
            </View>
          </FormSection>

          <FormSection icon={ImageIcon} title="Cover" description={isBook ? "Your book's cover." : project?.project_type === "file" ? undefined : "The image people see first."}>
            {project?.project_type === "file" ? (
              <View className="mb-4 overflow-hidden rounded-2xl border border-border bg-canvas">
                <FileFolderHero />
              </View>
            ) : (
              <ThumbnailPicker
                url={thumbnailUrl}
                aspect={aspect}
                isBook={isBook}
                uploading={uploadThumbnail.isPending}
                onPress={() => void handleThumbnailSelect()}
                supportingImageUrls={supportingImageUrls}
                onSupportingChange={setSupportingImageUrls}
              />
            )}
          </FormSection>

          <FormSection icon={Type} title="Basics">
            <FormField label="Title" value={title} onChangeText={setTitle} />

            {/* Fixed after creation — each type has its own details table and member data; changing it here would orphan that. */}
            <View className="mb-6">
              <Text className="mb-2.5 text-[11px] font-medium uppercase tracking-[1.54px] text-ink-muted">Project type</Text>
              <View className="flex-row items-center gap-2.5 rounded-xl bg-canvas px-4 py-3">
                <Icon as={PROJECT_TYPE_ICONS[t]} size={16} className="text-ink-muted" />
                <Text className="flex-1 text-sm text-ink">
                  {PROJECT_TYPE_LABELS[t]} <Text className="text-ink-muted">— can't be changed after creation</Text>
                </Text>
                <Icon as={Lock} size={14} className="text-ink-muted" />
              </View>
            </View>

            <View className="mb-4">
              <Text className="mb-2.5 text-[11px] font-medium uppercase tracking-[1.54px] text-ink-muted">Description</Text>
              <MentionTextarea value={description} onChange={setDescription} maxLength={CONTENT_LIMIT} rows={3} showFormatToolbar className="rounded-xl border border-border bg-canvas px-4 py-3" />
              <Text className={`mt-1.5 text-right text-xs ${contentCounterClass(description.length)}`}>
                {description.length}/{CONTENT_LIMIT}
              </Text>
            </View>

            <TopicPicker selected={topicIds} onToggle={toggleTopic} />
          </FormSection>

          <FormSection icon={PROJECT_TYPE_ICONS[t]} title={`${PROJECT_TYPE_LABELS[t]} details`}>
            {t === "media" ? <MediaFields value={mediaFields} onChange={setMediaFields} onError={setError} onUploadingChange={setMediaUploading} /> : null}
            {t === "file" ? <FileFields value={fileFields} onChange={setFileFields} onError={setError} maxFiles={maxFiles} onUploadingChange={setFileUploading} /> : null}
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
                  <View className="mb-4 rounded-xl border border-accent-a30 bg-accent-soft p-3">
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
                <BookFields value={bookFields} onChange={setBookFields} onError={setError} existingSource={existingBookDetails?.content_source} />
                {bookFields.content_source === "authored" ? <Text className="-mt-2 mb-4 text-xs text-ink-muted">Manage chapters from the book builder.</Text> : null}
              </>
            ) : null}
          </FormSection>

          {t !== "pitch" && t !== "media" ? (
            <FormSection icon={Banknote} title="Pricing" description={bookNotOwn ? "Free — it credits someone else's work." : "Free, or set a price."}>
              <PricingFields
                type={t}
                priceUsd={priceUsd}
                onPriceChange={setPriceUsd}
                showPromo={showPromo}
                onShowPromoChange={setShowPromo}
                promoPriceUsd={promoPriceUsd}
                onPromoPriceChange={setPromoPriceUsd}
                bookNotOwn={bookNotOwn}
              />
              {/* Pitches have no sale for a commission to attach to. Free projects are blocked too — read off the live form
                  value so this updates before Save — unless a program already exists (so it can still be turned off). */}
              <LinkRow
                icon={Percent}
                title="Affiliate program"
                description={(parseFloat(priceUsd) || 0) > 0 || !!affiliateProgram ? "Let others earn a commission for sharing this." : "Set a price above to enable this."}
                onPress={() => setAffiliateSheetOpen(true)}
                disabled={!((parseFloat(priceUsd) || 0) > 0 || !!affiliateProgram)}
              />
            </FormSection>
          ) : null}

          <FormSection icon={Eye} title="Sharing & access">
            <LinkRow
              icon={Link2}
              title={project.slug ? "Custom URL" : "Choose your custom URL"}
              description={project.slug ? "Change the link people use to open this." : "Give it a short, memorable link."}
              onPress={() => setLinkSheetOpen(true)}
            />
            {project.status === "active" ? (
              <LinkRow icon={Ticket} title="Guest Pass" description="A 6-hour link anyone can open." onPress={() => setGuestPassOpen(true)} />
            ) : null}
            <ToggleRow
              icon={EyeOff}
              title="Private project"
              description="Not listed anywhere, and not open to anyone by link — only people you add can see or open it."
              checked={isPrivate}
              onToggle={() => setIsPrivate(!isPrivate)}
            />
            {isPrivate ? <LinkRow icon={Users} title="Manage who has access" onPress={() => setManageAccessOpen(true)} /> : null}
          </FormSection>
        </View>
      </ScrollView>

      <FormFooter error={error} bottomInset={insets.bottom}>
        <Button onPress={() => void handleSubmit()} loading={updateProject.isPending} disabled={(project.project_type === "file" && fileUploading) || (project.project_type === "media" && mediaUploading)}>
          Save changes
        </Button>
      </FormFooter>

      {manageAccessOpen ? <ManageAccessSheet projectId={project.id} projectTitle={project.title} onClose={() => setManageAccessOpen(false)} /> : null}
      {affiliateSheetOpen ? (
        <AffiliateProgramSheet projectId={project.id} projectTitle={project.title} priceUsd={parseFloat(priceUsd) || 0} onClose={() => setAffiliateSheetOpen(false)} />
      ) : null}
      {linkSheetOpen ? <ProjectLinkSheet project={project} onClose={() => setLinkSheetOpen(false)} /> : null}
      {guestPassOpen ? <GuestPassSheet projectId={project.id} projectTitle={project.title} isPrivate={project.is_private} isPaid={(parseFloat(priceUsd) || 0) > 0} onClose={() => setGuestPassOpen(false)} /> : null}
    </KeyboardAvoider>
  );
}
