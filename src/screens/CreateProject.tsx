// src/screens/CreateProject.tsx
// New project: thumbnail → who it posts as → title → type (which changes the
// rest of the form) → description → topics → type-specific block → price/promo
// → privacy → publish. Which types you see depends on personal vs Page mode,
// admin switches and your eligibility. Course / authored Book / Room are
// created as drafts you finish building afterwards.
import { FileFolderHero } from "@/components/project/FileFolderArt";
import { matchesThumbSpec, thumbnailNoun, thumbnailSpecFor } from "@/lib/thumbnailSpec";
import { useThumbnailCropper } from "@/hooks/useThumbnailCropper";
import type { LocalFile } from "@/lib/localFile";
import { extractBookPdf } from "@/hooks/useBookBuilder";
import { Banknote, Eye, EyeOff, Image as ImageIcon, Type } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { MentionTextarea } from "@/components/post/MentionTextarea";
import { MAX_TOPICS, TopicPicker } from "@/components/post/TopicPicker";
import { BookFields, EMPTY_BOOK_FIELDS, type BookFieldsValue } from "@/components/project-types/BookFields";
import { CourseFields } from "@/components/project-types/CourseFields";
import { EMPTY_EVENT_FIELDS, EventFields, type EventFieldsValue } from "@/components/project-types/EventFields";
import {
  EMPTY_FILE_FIELDS,
  FileFields,
  fileFieldsError,
  fileFieldsToInputs,
  type FileFieldsValue,
} from "@/components/project-types/FileFields";
import { EMPTY_TALENT_FIELDS, TalentFields, type TalentFieldsValue } from "@/components/project-types/TalentFields";
import { EMPTY_MEDIA_FIELDS, MediaFields, mediaFieldsAreValid, type MediaFieldsValue } from "@/components/project-types/MediaFields";
import { NEW_ARTIST_TALENT, SongTalentField } from "@/components/project-types/SongTalentField";
import { useEnsureArtistTalent } from "@/hooks/usePortfolio";
import { EMPTY_MEETING_FIELDS, MeetingFields, type MeetingFieldsValue } from "@/components/project-types/MeetingFields";
import { EMPTY_PITCH_FIELDS, PitchFields, type PitchFieldsValue } from "@/components/project-types/PitchFields";
import { EMPTY_ROOM_FIELDS, RoomFields, type RoomFieldsValue } from "@/components/project-types/RoomFields";
import { EMPTY_URL_FIELDS, UrlFields, type UrlFieldsValue } from "@/components/project-types/UrlFields";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { ToggleRow } from "@/components/settings/SettingsParts";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ProfilePagesModal } from "@/components/profile/ProfilePagesModal";
import { SaveProgressDialog } from "@/components/ui/SaveProgressDialog";
import { Text } from "@/components/ui/Text";
import { TextLink } from "@/components/ui/TextLink";
import { useToast } from "@/components/ui/Toast";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { PageActionBlocked } from "@/components/page/PageActionBlocked";
import {
  FormFooter,
  FormSection,
  PricingFields,
  PROJECT_TYPE_ICONS,
  ProjectTypeChips,
  ThumbnailPicker,
} from "@/components/project/ProjectFormParts";
import {
  isTypeAllowedForKind,
  useBypassesCreatorRules,
  useCreatorRules,
  useMyCreatorKind,
} from "@/hooks/useCreatorKinds";
import { useActiveIdentity, useActivePagePermissions } from "@/hooks/usePages";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { useMyProfile } from "@/hooks/useProfile";
import { maxProjectFiles } from "@/lib/fileProject";
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
import { useLeaveGuard } from "@/hooks/useLeaveGuard";
import { pickSingleImage } from "@/lib/pickImage";
import {
  clearProjectDraft,
  projectDraftHasProgress,
  projectDraftKey,
  projectDraftSignature,
  readProjectDraft,
  writeProjectDraft,
  type ProjectDraftData,
} from "@/lib/projectDraft";
import { CONTENT_LIMIT, contentCounterClass } from "@/lib/textLimits";
import { friendlyError } from "@/lib/friendlyError";

// `fixedType` makes this a single-purpose creator (groups, at /groups/new): no type picker, its own draft, its own wording.
export function CreateProject({ fixedType }: { fixedType?: ProjectType } = {}) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const createProject = useCreateProject();
  const createPitchProject = useCreatePitchProject();
  const uploadThumbnail = useUploadProjectThumbnail();
  const cropper = useThumbnailCropper();
  const [thumbnailSource, setThumbnailSource] = useState<LocalFile | null>(null);
  const projectsEnabled = useFeatureFlag("projects_enabled");

  const [pagesOpen, setPagesOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>(fixedType ?? "file");
  const [topicIds, setTopicIds] = useState<Set<string>>(new Set());
  const [priceUsd, setPriceUsd] = useState("0");
  const [showPromo, setShowPromo] = useState(false);
  const [promoPriceUsd, setPromoPriceUsd] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailRatio, setThumbnailRatio] = useState<{ width: number; height: number } | null>(null);
  const [supportingImageUrls, setSupportingImageUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fixed at open (switch account mode FIRST, then create) — same rule as composing a post.
  const { data: identity } = useActiveIdentity();
  const { data: me } = useMyProfile();
  // One file for most accounts; up to six for verified, unrestricted ones (the database enforces it too).
  const restricted = useIsRestricted();
  const maxFiles = maxProjectFiles(!!me?.is_verified && !restricted);
  const postingAsPage = identity?.mode === "page" ? identity.page : null;
  const pagePerms = useActivePagePermissions();

  const { data: typeSettings } = useActiveProjectTypes();
  const { data: accessRules } = useProjectTypeAccessRules();
  const { data: myStats } = useMyEligibilityStats();
  const { data: isExempt } = useMyProjectTypeExemption();

  // Admin account-kind matrix: restricted / unrestricted / page type.
  const creatorKind = useMyCreatorKind();
  const { data: creatorRules } = useCreatorRules();
  const bypassesCreatorRules = useBypassesCreatorRules();

  const allowedTypes = getVisibleProjectTypes(
    postingAsPage ? "page" : "personal",
    typeSettings,
    accessRules,
    myStats,
    isExempt,
    (type) => bypassesCreatorRules || isTypeAllowedForKind(creatorRules, type, creatorKind)
  );
  const eligibility = getProjectTypeEligibility(projectType, accessRules, myStats, isExempt);

  // If the current pick isn't offered in this mode, fall back to the first one that is.
  useEffect(() => {
    if (fixedType) return;
    if (allowedTypes.length > 0 && !allowedTypes.includes(projectType)) setProjectType(allowedTypes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postingAsPage?.id, typeSettings, accessRules, myStats, isExempt, creatorRules, creatorKind]);

  // Per-type field state is kept separately so switching type never discards what was entered.
  const [fileFields, setFileFields] = useState<FileFieldsValue>(EMPTY_FILE_FIELDS);
  const [fileUploading, setFileUploading] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  // A song lives under an artist talent: a talent id, or NEW_ARTIST_TALENT to scaffold one on save. "" until the picker settles.
  const [songTalent, setSongTalent] = useState("");
  const ensureArtistTalent = useEnsureArtistTalent();
  const [urlFields, setUrlFields] = useState<UrlFieldsValue>(EMPTY_URL_FIELDS);
  const [mediaFields, setMediaFields] = useState<MediaFieldsValue>(EMPTY_MEDIA_FIELDS);
  // The one shape this project's thumbnail must be: it follows the type, and for media whether there is a video.
  const thumbSpec = thumbnailSpecFor(projectType, { hasVideo: mediaFields.video.enabled });
  const thumbNoun = thumbnailNoun(projectType, mediaFields.video.enabled);
  const thumbMismatch = !!(thumbnailUrl && thumbSpec && thumbnailRatio && !matchesThumbSpec(thumbnailRatio.width, thumbnailRatio.height, thumbSpec));
  const [eventFields, setEventFields] = useState<EventFieldsValue>(EMPTY_EVENT_FIELDS);
  const [meetingFields, setMeetingFields] = useState<MeetingFieldsValue>(EMPTY_MEETING_FIELDS);
  const [talentFields, setTalentFields] = useState<TalentFieldsValue>(EMPTY_TALENT_FIELDS);
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

  // ---- Unsaved progress ---------------------------------------------------------------------------------
  // Leaving this form with something filled in asks "save as a draft / discard?" (see useLeaveGuard). The draft is
  // kept on this phone — see lib/projectDraft.ts for why it isn't a `draft` row in `projects` — and is put back
  // the next time New project opens. One draft per account per acting identity (personal / each Page).
  const draftKey = me?.id && identity !== undefined ? projectDraftKey(me.id, postingAsPage?.id, fixedType) : null;
  const restoredRef = useRef(false);
  // The form as last restored from a draft; leaving with the form still identical to it isn't "unsaved".
  const baselineRef = useRef<string | null>(null);
  const [restoredDraftNotice, setRestoredDraftNotice] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);

  function collectDraft(): ProjectDraftData {
    return {
      title,
      description,
      projectType,
      topicIds: Array.from(topicIds),
      priceUsd,
      showPromo,
      promoPriceUsd,
      isPrivate,
      thumbnailUrl,
      thumbnailRatio,
      supportingImageUrls,
      fileFields,
      urlFields,
      mediaFields,
      eventFields,
      meetingFields,
      talentFields,
      pitchFields,
      roomFields,
      bookFields,
    };
  }

  function applyDraft(d: ProjectDraftData) {
    setTitle(d.title);
    setDescription(d.description);
    setProjectType(fixedType ?? d.projectType);
    setTopicIds(new Set(d.topicIds));
    setPriceUsd(d.priceUsd);
    setShowPromo(d.showPromo);
    setPromoPriceUsd(d.promoPriceUsd);
    setIsPrivate(d.isPrivate);
    setThumbnailUrl(d.thumbnailUrl);
    setThumbnailRatio(d.thumbnailRatio);
    setSupportingImageUrls(d.supportingImageUrls);
    setFileFields(d.fileFields);
    setUrlFields(d.urlFields);
    setMediaFields(d.mediaFields);
    setEventFields(d.eventFields);
    setMeetingFields(d.meetingFields);
    setTalentFields(d.talentFields);
    setPitchFields(d.pitchFields);
    setRoomFields({ ...EMPTY_ROOM_FIELDS, ...d.roomFields });
    setBookFields(d.bookFields);
  }

  function resetForm() {
    setTitle("");
    setDescription("");
    setProjectType(fixedType ?? (allowedTypes.length === 0 || allowedTypes.includes("file") ? "file" : allowedTypes[0]));
    setTopicIds(new Set());
    setPriceUsd("0");
    setShowPromo(false);
    setPromoPriceUsd("");
    setIsPrivate(false);
    setThumbnailUrl(null);
    setThumbnailRatio(null);
    setSupportingImageUrls([]);
    setFileFields(EMPTY_FILE_FIELDS);
    setUrlFields(EMPTY_URL_FIELDS);
    setMediaFields(EMPTY_MEDIA_FIELDS);
    setEventFields(EMPTY_EVENT_FIELDS);
    setMeetingFields(EMPTY_MEETING_FIELDS);
    setTalentFields(EMPTY_TALENT_FIELDS);
    setPitchFields(EMPTY_PITCH_FIELDS);
    setRoomFields(EMPTY_ROOM_FIELDS);
    setBookFields(EMPTY_BOOK_FIELDS);
  }

  const currentDraft = collectDraft();
  const progressNow = projectDraftHasProgress(currentDraft);
  const hasUnsavedProgress = progressNow && projectDraftSignature(currentDraft) !== baselineRef.current;
  const leaveGuard = useLeaveGuard(hasUnsavedProgress);

  // Put a saved draft back, once, as soon as we know whose form this is (account + acting identity). The read is
  // async: if the person has already started typing by the time it returns, their input wins and nothing is clobbered.
  const progressNowRef = useRef(false);
  progressNowRef.current = progressNow;
  useEffect(() => {
    if (!draftKey || restoredRef.current) return;
    restoredRef.current = true;
    let cancelled = false;
    void readProjectDraft(draftKey).then((stored) => {
      if (cancelled || !stored || progressNowRef.current) return;
      applyDraft(stored.data);
      baselineRef.current = projectDraftSignature(stored.data);
      setRestoredDraftNotice(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  async function handleLeaveSave() {
    if (leaveSaving) return;
    setLeaveSaving(true);
    try {
      if (!draftKey || !(await writeProjectDraft(draftKey, collectDraft()))) {
        toast("Couldn't save the draft on this phone. Check that it has free storage.", { variant: "error" });
        leaveGuard.stay();
        return;
      }
      toast("Draft saved. It'll be here next time you create a project.", { variant: "success" });
      // Land on the Projects tab where the person's projects live, not wherever the leave gesture was headed.
      leaveGuard.allowLeaving();
      if (postingAsPage) router.replace(`/page/${postingAsPage.username}?tab=projects` as Href);
      else if (me?.username) router.replace(`/profile/${me.username}?tab=projects` as Href);
      else leaveGuard.proceed();
    } finally {
      setLeaveSaving(false);
    }
  }

  async function handleLeaveDiscard() {
    if (draftKey) await clearProjectDraft(draftKey);
    leaveGuard.proceed();
  }

  function handleStartOver() {
    if (draftKey) void clearProjectDraft(draftKey);
    baselineRef.current = null;
    setRestoredDraftNotice(false);
    resetForm();
  }

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

  // Crop (if needed) to the project's shape, then upload. `file` is what the person picked, or the kept original.
  async function cropAndUpload(file: LocalFile) {
    if (!thumbSpec) return;
    try {
      const ready = await cropper.request(file, thumbSpec, { title: `Crop ${thumbNoun}` });
      if (!ready) return; // cancelled
      const { url, width, height } = await uploadThumbnail.mutateAsync({ file: ready, spec: thumbSpec });
      setThumbnailUrl(url);
      setThumbnailRatio({ width, height });
      setThumbnailSource(file);
      setError(null);
    } catch (err) {
      setError(friendlyError(err, "Thumbnail upload failed."));
    }
  }

  async function handleThumbnailSelect() {
    const file = await pickSingleImage();
    if (file) await cropAndUpload(file);
  }

  // Re-crop from the original the person picked; after a draft restore there isn't one, so pick the picture again.
  async function handleRecrop() {
    const source = thumbnailSource ?? (await pickSingleImage());
    if (source) await cropAndUpload(source);
  }

  function validateTypeSpecific(): string | null {
    if (thumbMismatch && thumbSpec) return `Your ${thumbNoun} needs to be ${thumbSpec.label}. Use "Crop it to fit" under the picture.`;
    if (projectType === "file") {
      const fileError = fileFieldsError(fileFields);
      if (fileError) return fileError;
    }
    if (projectType === "url" && !urlFields.url.trim()) return "Add the link you're sharing access to.";
    if (projectType === "media" && !mediaFieldsAreValid(mediaFields)) {
      if (!mediaFields.audio.enabled && !mediaFields.video.enabled && !mediaFields.image.enabled) return "Turn on Audio, Video, Image, or any combination.";
      return "Add a link or upload a file for each channel you turned on.";
    }
    if (projectType === "event" && !eventFields.location_value.trim()) return eventFields.location_type === "physical" ? "Add the event address." : "Add the join link.";
    if (projectType === "meeting" && !meetingFields.scheduled_at) return "Set when this meeting happens.";
    if (projectType === "gig" && !talentFields.role_id) return "Select the professional role this talent represents.";
    if (projectType === "gig" && !talentFields.tagline.trim()) return "Add a short tagline for this talent.";
    if (projectType === "pitch") {
      const goal = parseFloat(pitchFields.goal_amount_usd);
      if (!pitchFields.goal_amount_usd.trim() || Number.isNaN(goal) || goal <= 0) return "Set a fundraising goal above $0.";
    }
    if (projectType === "room" && roomFields.kind === "cohort" && roomFields.start_date && roomFields.end_date && new Date(roomFields.end_date) <= new Date(roomFields.start_date)) {
      return "End date needs to be after the start date.";
    }
    if (projectType === "book" && bookFields.content_source !== "authored") {
      if (bookFields.content_source === "link" && !bookFields.url.trim()) return "Add the link to the book or article.";
      if (bookFields.content_source === "upload" && !bookFields.file_path) return "Upload a PDF to continue.";
      if (bookFields.content_source === "download" && !bookFields.file_path) return "Upload the PDF readers will download.";
      if (bookFields.content_source === "upload" && !bookFields.allow_download && !bookFields.allow_read_in_app) return "Allow download, in-app reading, or both.";
      if (!bookFields.is_own_work && !bookFields.source_credit.trim()) return "Credit the original author or source.";
      if (!bookFields.is_own_work && !bookFields.author_name.trim()) return "Add the author's name.";
    }
    return null;
  }

  function goToCreated(courseId?: string, groupId?: string) {
    // The project exists now: the saved draft has done its job, and the redirect below is the person finishing,
    // not leaving unsaved work behind.
    if (draftKey) void clearProjectDraft(draftKey);
    leaveGuard.allowLeaving();
    toast(`${title.trim()} created successfully.`, { variant: "success" });
    // A new course goes straight into the builder, where the setup wizard opens for the empty draft.
    if (courseId) router.replace(`/courses/${courseId}` as Href);
    // A group lives at its own page, not on the profile's Projects tab — land the creator inside it.
    else if (groupId) router.replace(`/groups/${groupId}` as Href);
    else if (postingAsPage) router.replace(`/page/${postingAsPage.username}?tab=projects` as Href);
    else if (me?.username) router.replace(`/profile/${me.username}?tab=projects` as Href);
    else router.back();
  }

  async function handleSubmit() {
    setError(null);
    if (!title.trim()) return setError("Title is required.");
    if (projectType === "file" && fileUploading) return setError("Your file is still uploading — wait for it to finish.");
    if (projectType === "media" && mediaUploading) return setError("Your file is still uploading — wait for it to finish.");

    // A song is never sold (the database refuses a price on one), so it always saves as free.
    const price = projectType === "media" ? 0 : parseFloat(priceUsd) || 0;
    const typeError = validateTypeSpecific();
    if (typeError) return setError(typeError);
    if (eligibility && !eligibility.eligible) return setError(eligibility.reasons[0]);
    if (allowedTypes.length > 0 && !allowedTypes.includes(projectType)) {
      return setError("This kind of account can't create that project type.");
    }

    if (projectType === "pitch") {
      try {
        await createPitchProject.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          thumbnail_url: thumbnailUrl ?? undefined,
          thumbnail_width: thumbnailRatio?.width,
          thumbnail_height: thumbnailRatio?.height,
          supporting_image_urls: thumbnailUrl ? supportingImageUrls : undefined,
          is_private: isPrivate,
          posted_as_page_id: postingAsPage?.id,
          goal_amount_usd: parseFloat(pitchFields.goal_amount_usd),
          topic_ids: Array.from(topicIds),
        });
        goToCreated();
      } catch (err) {
        setError(friendlyError(err, "Couldn't create project."));
      }
      return;
    }

    let promoPrice: number | null = null;
    if (projectType !== "media" && showPromo && promoPriceUsd.trim() !== "") {
      promoPrice = parseFloat(promoPriceUsd);
      if (Number.isNaN(promoPrice) || promoPrice < 0) return setError("Promo price must be a valid amount.");
      if (promoPrice >= price) return setError("Promo price must be lower than the actual price.");
    }

    const channelSource = (c: { file_path: string | null }) => (c.file_path ? "upload" : "link");
    const cleanFaq = talentFields.faq.map((f) => ({ question: f.question.trim(), answer: f.answer.trim() })).filter((f) => f.question && f.answer);
    const cleanDeliverables = talentFields.deliverables.map((d) => d.trim()).filter(Boolean);

    try {
      // A song needs a talent. "New talent" scaffolds the Music Artist talent first, so the song never exists without one.
      let parentTalentId: string | undefined;
      if (projectType === "media") {
        if (!songTalent) return setError("Pick a talent.");
        parentTalentId = songTalent === NEW_ARTIST_TALENT ? await ensureArtistTalent.mutateAsync() : songTalent;
      }

      const created = await createProject.mutateAsync({
        title: title.trim(),
        parent_gig_id: parentTalentId,
        description: description.trim() || undefined,
        project_type: projectType,
        posted_as_page_id: postingAsPage?.id,
        external_url: projectType === "url" ? urlFields.url.trim() : undefined,
        // File: the first file's path is mirrored here (older app builds read it); the full list goes in file_details.
        file_path: projectType === "file" ? fileFieldsToInputs(fileFields)[0]?.file_path : undefined,
        file_details: projectType === "file" ? { files: fileFieldsToInputs(fileFields) } : undefined,
        thumbnail_url: projectType === "file" ? undefined : (thumbnailUrl ?? undefined),
        thumbnail_width: projectType === "file" ? undefined : thumbnailRatio?.width,
        thumbnail_height: projectType === "file" ? undefined : thumbnailRatio?.height,
        supporting_image_urls: projectType !== "file" && thumbnailUrl ? supportingImageUrls : undefined,
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
                role_id: talentFields.role_id,
                tagline: talentFields.tagline.trim(),
                delivery_estimate: talentFields.delivery_estimate.trim() || undefined,
                sample_project_ids: talentFields.sample_project_ids,
                revisions_included: talentFields.revisions_included.trim() ? parseInt(talentFields.revisions_included.trim(), 10) : undefined,
                deliverables: cleanDeliverables.length > 0 ? cleanDeliverables : undefined,
                faq: cleanFaq.length > 0 ? cleanFaq : undefined,
              }
            : undefined,
        room_details:
          projectType === "room"
            ? {
                kind: roomFields.kind,
                join_mode: roomFields.kind === "community" ? roomFields.join_mode : "request",
                start_date: roomFields.kind === "cohort" && roomFields.start_date ? new Date(roomFields.start_date).toISOString() : undefined,
                end_date: roomFields.kind === "cohort" && roomFields.end_date ? new Date(roomFields.end_date).toISOString() : undefined,
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
                file_path: bookFields.content_source === "upload" || bookFields.content_source === "download" ? (bookFields.file_path ?? undefined) : undefined,
                allow_download: bookFields.content_source === "download" ? true : bookFields.content_source === "upload" ? bookFields.allow_download : undefined,
                allow_read_in_app: bookFields.content_source === "download" ? false : bookFields.content_source === "upload" ? bookFields.allow_read_in_app : undefined,
              }
            : undefined,
      });
      // An uploaded PDF book: extract its text into chapters in the background (best effort — the reader retries on the
      // owner's first open).
      if (projectType === "book" && bookFields.content_source === "upload" && bookFields.allow_read_in_app && created?.id) {
        void extractBookPdf(created.id).catch(() => {});
      }
      goToCreated(projectType === "course" ? created?.id : undefined, projectType === "room" ? created?.id : undefined);
    } catch (err) {
      setError(friendlyError(err, "Couldn't create project."));
    }
  }

  if (postingAsPage && !pagePerms.loading && !pagePerms.can("create_projects")) {
    return <PageActionBlocked pageName={postingAsPage.name} action="create projects" />;
  }

  if (!projectsEnabled) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title={fixedType === "room" ? "New group" : "New project"} />
        <Text className="px-4 text-sm text-ink-muted">New projects aren't being created right now. Check back later.</Text>
      </View>
    );
  }

  const bookNotOwn = projectType === "book" && !bookFields.is_own_work;
  const isDraftType = projectType === "course" || (projectType === "book" && bookFields.content_source === "authored");
  const submitting = projectType === "pitch" ? createPitchProject.isPending : createProject.isPending;

  return (
    <KeyboardAvoider className="flex-1 bg-canvas">
      <ScreenHeader title={fixedType === "room" ? "New group" : "New project"} />
      <ScrollView showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        <View className="w-full max-w-md gap-3 self-center">
          {restoredDraftNotice ? (
            <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
              <Text className="flex-1 text-sm text-ink-muted">Picked up where you left off.</Text>
              <Pressable onPress={handleStartOver} accessibilityRole="button" hitSlop={8}>
                <Text className="text-sm font-medium text-accent">Start over</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Who it posts as — fixed once the form is open, so it's a quiet line rather than a section. */}
          <View className="flex-row items-center gap-2.5 px-1 pb-1">
            <Avatar src={postingAsPage ? postingAsPage.avatar_url : me?.avatar_url} name={postingAsPage ? postingAsPage.name : (me?.display_name ?? "You")} size="sm" />
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

          {/* 1 — What are you making? The type decides which fields appear below. */}
          {!fixedType ? (
          <FormSection icon={PROJECT_TYPE_ICONS[projectType]} title="Project type" description="What are you creating? The form adapts to your choice.">
            <ProjectTypeChips options={allowedTypes.filter((t) => t !== "room")} value={projectType} onChange={setProjectType} />
            <Text className="mb-4 text-xs text-ink-muted">
              {PROJECT_TYPE_HINTS[projectType]}
              {postingAsPage
                ? " Event is page-only — that's why some types you might expect aren't listed here. Groups are created from Connect."
                : " Talent, Meeting, Media, and File are personal-only — switch to a page to create an Event. Groups are created from Connect."}
            </Text>
            {eligibility && !eligibility.eligible ? (
              <View className="mb-4 rounded-xl border border-danger-a30 bg-danger-a10 px-4 py-3">
                <Text className="mb-1 text-sm font-medium text-danger">You don't meet the requirements for {PROJECT_TYPE_LABELS[projectType]} yet:</Text>
                {eligibility.reasons.map((reason) => (
                  <Text key={reason} className="text-xs text-danger">{`• ${reason}`}</Text>
                ))}
              </View>
            ) : null}
          </FormSection>
          ) : null}

          {/* 2 — Cover. */}
          <FormSection icon={ImageIcon} title="Cover" description={projectType === "file" ? undefined : `Your ${thumbNoun} — the image people see first.`}>
            {cropper.element}
            {projectType === "file" ? (
              <View className="mb-4 overflow-hidden rounded-2xl border border-border bg-canvas">
                <FileFolderHero />
              </View>
            ) : (
              <ThumbnailPicker
                url={thumbnailUrl}
                spec={thumbSpec!}
                noun={thumbNoun}
                uploading={uploadThumbnail.isPending}
                onPress={() => void handleThumbnailSelect()}
                needsRecrop={thumbMismatch}
                onRecrop={() => void handleRecrop()}
                supportingImageUrls={supportingImageUrls}
                onSupportingChange={setSupportingImageUrls}
              />
            )}
          </FormSection>

          {/* 3 — The basics. */}
          <FormSection icon={Type} title="Basics">
            <FormField label="Title" value={title} onChangeText={setTitle} />

            <View className="mb-4">
              <Text className="mb-2.5 text-[11px] font-medium uppercase tracking-[1.54px] text-ink-muted">Description</Text>
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

            <TopicPicker selected={topicIds} onToggle={toggleTopic} text={`${title} ${description}`} />
          </FormSection>

          {/* 4 — Whatever this type needs. */}
          <FormSection icon={PROJECT_TYPE_ICONS[projectType]} title={`${PROJECT_TYPE_LABELS[projectType]} details`}>
            {projectType === "media" ? <SongTalentField value={songTalent} onChange={setSongTalent} /> : null}
            {projectType === "media" ? <MediaFields value={mediaFields} onChange={setMediaFields} onError={setError} onUploadingChange={setMediaUploading} /> : null}
            {projectType === "file" ? <FileFields value={fileFields} onChange={setFileFields} onError={setError} maxFiles={maxFiles} onUploadingChange={setFileUploading} /> : null}
            {projectType === "url" ? <UrlFields value={urlFields} onChange={setUrlFields} /> : null}
            {projectType === "event" ? <EventFields value={eventFields} onChange={setEventFields} /> : null}
            {projectType === "meeting" ? <MeetingFields value={meetingFields} onChange={setMeetingFields} /> : null}
            {projectType === "room" ? <RoomFields value={roomFields} onChange={setRoomFields} /> : null}
            {projectType === "course" ? <CourseFields /> : null}
            {projectType === "gig" ? <TalentFields value={talentFields} onChange={setTalentFields} /> : null}
            {projectType === "pitch" ? <PitchFields value={pitchFields} onChange={setPitchFields} /> : null}
            {projectType === "book" ? <BookFields value={bookFields} onChange={setBookFields} onError={setError} /> : null}
          </FormSection>

          {/* 5 — Price. A pitch never carries one: supporters pick their own amount. Neither does a song. */}
          {projectType !== "pitch" && projectType !== "media" ? (
            <FormSection icon={Banknote} title="Pricing" description={bookNotOwn ? "Free — it credits someone else's work." : "Free, or set a price."}>
              <PricingFields
                type={projectType}
                priceUsd={priceUsd}
                onPriceChange={setPriceUsd}
                showPromo={showPromo}
                onShowPromoChange={setShowPromo}
                promoPriceUsd={promoPriceUsd}
                onPromoPriceChange={setPromoPriceUsd}
                bookNotOwn={bookNotOwn}
              />
            </FormSection>
          ) : null}

          {/* 6 — Who can see it. */}
          <FormSection icon={Eye} title="Visibility">
            <ToggleRow
              icon={EyeOff}
              title="Private project"
              description="Not listed anywhere, and not open to anyone by link — only people you add can see or open it."
              checked={isPrivate}
              onToggle={() => setIsPrivate(!isPrivate)}
            />
          </FormSection>
        </View>
      </ScrollView>

      <FormFooter error={error} bottomInset={insets.bottom}>
        <Button onPress={() => void handleSubmit()} loading={submitting} disabled={(projectType === "file" && fileUploading) || (projectType === "media" && mediaUploading)}>
          {isDraftType ? "Create draft" : projectType === "pitch" ? "Publish pitch" : projectType === "room" ? "Create group" : "Publish project"}
        </Button>
      </FormFooter>

      {pagesOpen ? <ProfilePagesModal mode="owner" navigateOnSwitch={false} onClose={() => setPagesOpen(false)} /> : null}

      {leaveGuard.isBlocked ? (
        <SaveProgressDialog
          description="Save this project as a draft on this phone to finish later, or discard it."
          saving={leaveSaving}
          onSave={() => void handleLeaveSave()}
          onDiscard={() => void handleLeaveDiscard()}
          onKeepEditing={leaveGuard.stay}
        />
      ) : null}
    </KeyboardAvoider>
  );
}
