// src/components/project/ProjectCard.tsx
// The project card: artwork (or a playable 30s preview for Media), type + price,
// description, then whatever the project's TYPE does once you have access —
// download a file, open a link, read a book, view a ticket, join a course /
// room / meeting — or the Buy / Book / Support control when you don't. Owners
// get a menu to edit, publish, archive, manage access, push to feed, or delete.
import { FileFolderHero } from "@/components/project/FileFolderArt";
import { DownloadCancelledError, useDownloadProjectFile } from "@/hooks/useDownloadProjectFile";
import { useDownloadAllProjectFiles, type DownloadAllMode } from "@/hooks/useDownloadAllProjectFiles";
import { OptionsModal } from "@/components/ui/OptionsModal";
import { canZipFiles, formatFileSize } from "@/lib/fileProject";
import { useProjectFiles, type ProjectFile } from "@/hooks/useProjectFiles";
import { ProjectFilesList } from "@/components/project/ProjectFilesList";
import {
  Archive,
  KeyRound,
  ArrowDownToLine,
  BookOpen,
  BookText,
  Bookmark,
  Briefcase,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileArchive,
  Eye,
  EyeOff,
  Gift as GiftIcon,
  Heart,
  Image as ImageIcon,
  Link as LinkIcon,
  Lock,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Music,
  Pencil,
  Redo2,
  RotateCcw,
  Send,
  Ticket,
  Trash2,
  GitFork,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { router, usePathname, type Href } from "expo-router";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_THUMB_HEIGHT_VH, thumbnailLayout } from "@/lib/thumbnailFit";
import { Pressable, Share, View, useWindowDimensions } from "react-native";

import { ReactionMoreSheet } from "@/components/post/ReactionMoreSheet";
import { ReactionTray, type EngagementAction } from "@/components/post/ReactionTray";
import { GiftPicker } from "@/components/post/GiftPicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useErrorNotice } from "@/components/ui/ErrorNotice";
import { useToast } from "@/components/ui/Toast";
import { UnlockReveal } from "@/components/ui/UnlockReveal";
import { useAffiliateProgram } from "@/hooks/useAffiliates";
import { useAuth } from "@/hooks/useAuth";
import { useProjectOwnership } from "@/hooks/useProjectOwnership";
import { useStartConversation } from "@/hooks/useMessaging";
import { useProjectAccessCount, useLogFreeProjectAccess } from "@/hooks/useProjectAccess";
import { useIsProjectMember } from "@/hooks/useProjectMembers";
import { useBookDetails, useMediaDetails, usePitchDetails, usePitchRaised } from "@/hooks/useProjectTypeDetails";
import {
  getEffectivePrice,
  hasActivePromo,
  isProjectFree,
  PROJECT_TYPE_LABELS,
  useBookTalent,
  useDeleteProject,
  useGetProjectFile,
  useHasPurchased,
  usePurchaseProject,
  useSetProjectStatus,
  type Project,
} from "@/hooks/useProjects";
import { useOfflineDownload } from "@/hooks/useOfflineProjects";
import { useIsProjectSaved, useToggleSavedProject } from "@/hooks/useSavedProjects";
import { APP_URL } from "@/lib/config";
import { safeReturnPath } from "@/lib/authRedirect";
import { projectGalleryImages } from "@/lib/projectImages";
import { ProjectImageCarousel } from "./ProjectImageCarousel";
import { ctaFill } from "@/lib/contrast";
import { haptics } from "@/lib/haptics";
import { renderFormattedText } from "@/lib/formatText";
import { resolveFunctionErrorMessage } from "@/lib/functionErrors";
import { formatBytes, isOfflineEligible, libraryTabForType, OfflineError } from "@/lib/offlineProjects";
// Aliased: ProjectCard declares its own openExternal(url, kind) below, which would otherwise shadow this import and call itself.
import { openExternal as openExternalGuarded } from "@/lib/openExternal";
import { useTheme } from "@/theme/ThemeProvider";
import { AffiliateShareSheet } from "./AffiliateShareSheet";
import { OfferNudgeSheet } from "./OfferNudgeSheet";
import { OFFER_ELIGIBLE_TYPES, useOfferNudge } from "@/hooks/useOffers";
import { GuestPassSheet } from "./GuestPassSheet";
import { ManageAccessSheet } from "./ManageAccessSheet";
import { OfflineDownloadSheet } from "./OfflineDownloadSheet";
import { MediaHeroPlayer } from "./MediaHeroPlayer";
import { PrivateProjectNotice } from "./PrivateProjectNotice";
import { SupportPitchSheet } from "./SupportPitchSheet";

type ProjectType = Project["project_type"];
const INLINE_TYPES: ProjectType[] = ["file", "url"];
const TYPE_ROUTE: Partial<Record<ProjectType, (id: string) => string>> = {
  event: (id) => `/projects/${id}/ticket`,
  meeting: (id) => `/meetings/${id}`,
  course: (id) => `/courses/${id}`,
};
const TYPE_ICON: Partial<Record<ProjectType, LucideIcon>> = { event: Ticket, meeting: Video, room: Users, course: BookOpen, gig: Briefcase, pitch: Heart };
const TYPE_ACTION_LABEL: Partial<Record<ProjectType, string>> = { event: "View ticket", meeting: "Go to meeting", course: "Continue course" };

function LinkAction({ icon, label, onPress, disabled, muted }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean; muted?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-row items-center gap-1.5 ${disabled ? "opacity-50" : ""}`}
    >
      <Icon as={icon} size={15} className={muted ? "text-ink-muted" : "text-accent"} />
      <Text className={`text-sm font-medium ${muted ? "text-ink-muted" : "text-accent"}`}>{label}</Text>
    </Pressable>
  );
}

function LockedNote({ label = "Locked" }: { label?: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon as={Lock} size={15} className="text-ink-muted" />
      <Text className="text-sm text-ink-muted">{label}</Text>
    </View>
  );
}

function PricePill({ children, tone = "soft" }: { children: string; tone?: "soft" | "outline" }) {
  return (
    <View className={`rounded-full px-2.5 py-1 ${tone === "soft" ? "bg-accent-soft" : "border border-border bg-surface"}`}>
      <Text className={`text-xs font-semibold ${tone === "soft" ? "text-accent" : "text-ink"}`}>{children}</Text>
    </View>
  );
}

interface ProjectCardProps {
  project: Project;
  isOwnerView?: boolean;
  isDetailView?: boolean;
  /** True only for the creator's own profile → Projects lists: the one place the creator gets the book builder. Everywhere else they see the project as a visitor does. */
  manageContent?: boolean;
  shareUrl?: string;
  /** True while the card is on screen — a playing preview stops when this goes false. */
  visible?: boolean;
  /** Signed-out landing mode: the description and any extra browsing info stay behind a "Details" toggle; the action row below is always visible. */
  concealDetails?: boolean;
  /** Extra content (event info, FAQ, topics…) shown with the description when Details is open. */
  detailsSlot?: ReactNode;
}

function ProjectCardImpl({ project, isOwnerView, isDetailView, manageContent, shareUrl, visible = true, concealDetails, detailsSlot }: ProjectCardProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const { colors, resolvedTheme } = useTheme();
  const toast = useToast();
  const notifyError = useErrorNotice();
  // Ownership is judged against the identity being acted as: a project created
  // personally is NOT a Page's own, even though owner_id is the same user.
  const ownership = useProjectOwnership();
  const isOwner = isOwnerView ?? ownership.isOwner(project);
  const isArchivedFrozen = isOwner && project.status === "archived";
  const isFree = isProjectFree(project);
  const showPromo = hasActivePromo(project);
  const effectivePrice = getEffectivePrice(project);
  const isCourseUnpublished = project.project_type === "course" && !project.published_at;

  const hasPurchasedQuery = useHasPurchased(project.id);
  const purchaseProject = usePurchaseProject();
  // Offers: when this project is part of one of the creator's bundles, tapping Buy first suggests the bundle
  // (see OfferNudgeSheet). Looked up on tap, not on render, so a feed of paid cards doesn't fire a request each.
  const offerNudge = useOfferNudge(project.id);
  const buyBusy = purchaseProject.isPending || offerNudge.checking;
  const bookTalent = useBookTalent();
  const downloadProjectFile = useDownloadProjectFile();
  const downloadAllFiles = useDownloadAllProjectFiles();
  const [downloadAllOpen, setDownloadAllOpen] = useState(false);
  const getAudioStream = useGetProjectFile();
  const getVideoStream = useGetProjectFile();
  const getImageStream = useGetProjectFile();
  const getBookDownload = useGetProjectFile();
  const setStatus = useSetProjectStatus();
  const deleteProject = useDeleteProject();
  const isSavedQuery = useIsProjectSaved(project.id);
  const toggleSaved = useToggleSavedProject(project.id);
  const accessCountQuery = useProjectAccessCount(project.id);
  const logFreeAccess = useLogFreeProjectAccess();
  const startConversation = useStartConversation();

  const isMedia = project.project_type === "media";
  const isPitch = project.project_type === "pitch";
  const isBook = project.project_type === "book";
  const isRoom = project.project_type === "room";
  const { data: mediaDetails } = useMediaDetails(isMedia ? project.id : undefined);
  const { data: pitchDetails } = usePitchDetails(isPitch ? project.id : undefined);
  const { data: pitchRaised } = usePitchRaised(isPitch ? project.id : undefined);
  const { data: bookDetails, isLoading: bookDetailsLoading } = useBookDetails(isBook ? project.id : undefined);
  const isBookDraftUnpublished = isBook && bookDetails?.content_source === "authored" && !project.published_at;
  // The builder is reachable only from the creator's own profile lists (manageContent) — see the prop.
  const canEditBookContent = !!manageContent && isOwner && isBook && bookDetails?.content_source === "authored";
  const { data: affiliateProgram } = useAffiliateProgram(project.project_type !== "pitch" ? project.id : undefined);
  const canBecomeAffiliate = !!user && !isOwner && !!affiliateProgram?.enabled && project.price_usd > 0;
  const isMemberQuery = useIsProjectMember(project.id, project.is_private);

  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const showDetails = !concealDetails || detailsOpen;
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [manageAccessOpen, setManageAccessOpen] = useState(false);
  const [guestPassOpen, setGuestPassOpen] = useState(false);
  const [supportSheetOpen, setSupportSheetOpen] = useState(false);
  const [affiliateShareOpen, setAffiliateShareOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [imageLinkCopied, setImageLinkCopied] = useState(false);
  const menuButtonRef = useRef<View>(null);

  const hasPurchased = !!hasPurchasedQuery.data;
  const isMember = isMemberQuery.data === true;
  const privacyBlocked = project.is_private && !isOwner && !isMember;
  // A signed-out visitor never has access to anything, free or not: a shared link is a landing page, and every way
  // past it (Read, Download, Listen, Join…) goes through login first.
  const hasAccess = !!user && !privacyBlocked && (isOwner || hasPurchased || (isFree && !isRoom));

  // File projects can hold several files. The list names each saved copy (the uploaded file's own name unless the
  // creator typed one), so it's loaded for anyone who can download, and on the project's own screen for everyone.
  const isFileProject = project.project_type === "file";
  const { data: projectFiles } = useProjectFiles(project.id, isFileProject && (hasAccess || !!isDetailView));
  // file_count rides along on the project row; some lists select explicit columns without it, so trust the loaded
  // list too — otherwise a multi-file project could look like a one-file one and download only its first file.
  const fileCount = Math.max(project.file_count ?? 0, projectFiles?.length ?? 0);
  const isMultiFile = isFileProject && fileCount > 1;
  const isSaved = !!isSavedQuery.data;

  // Back to THIS page after login — the pretty /:slug address when that's how they arrived. replace (not push) so the
  // guest page isn't left mounted underneath once they're signed in.
  const redirectToLogin = () => {
    const target = (isDetailView ? safeReturnPath(pathname) : null) ?? `/projects/${project.id}`;
    router.replace(`/login?redirect=${encodeURIComponent(target)}` as Href);
  };
  const requireUser = (): boolean => {
    if (user) return true;
    redirectToLogin();
    return false;
  };
  const openGift = () => {
    if (requireUser()) setShowGiftPicker(true);
  };
  const openSupport = () => {
    if (requireUser()) setSupportSheetOpen(true);
  };
  const logFreeAccessIfNeeded = (accessType: "download" | "stream" | "link_click") => {
    if (isFree && !isOwner) logFreeAccess.mutate({ projectId: project.id, accessType });
  };
  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  // ── Download to library: keep this project on the device so it opens with no network (see lib/offlineStore.ts) ──
  const offline = useOfflineDownload(project.id, hasPurchased ? "purchased" : "free");
  const [offlineSheetOpen, setOfflineSheetOpen] = useState(false);
  const [cellularBytes, setCellularBytes] = useState<number | null>(null);
  const [confirmRemoveOffline, setConfirmRemoveOffline] = useState(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );
  // Only offered on the project's own page, to someone who can already open it (paid, or free). The server re-checks
  // everything — including a host's choice to switch downloads off — so this only decides whether to SHOW the option.
  const offlineEligible =
    !!isDetailView &&
    !isOwner &&
    hasAccess &&
    !isCourseUnpublished &&
    !isBookDraftUnpublished &&
    isOfflineEligible({
      projectType: project.project_type,
      filePath: project.file_path,
      book: bookDetails ? { content_source: bookDetails.content_source, allow_download: bookDetails.allow_download, allow_read_in_app: bookDetails.allow_read_in_app } : null,
      media: mediaDetails ?? null,
    });

  async function beginOfflineDownload(confirmedCellular = false) {
    if (!requireUser()) return;
    setCellularBytes(null);
    setOfflineSheetOpen(true);
    try {
      await offline.start(confirmedCellular);
    } catch (e) {
      if (e instanceof OfflineError && e.code === "needs_confirmation") {
        setOfflineSheetOpen(false);
        setCellularBytes(e.bytes ?? 0);
      } else if (e instanceof OfflineError && e.code === "cancelled") {
        setOfflineSheetOpen(false);
      }
      // Any other failure: the sheet stays open and shows the reason, with Try again where that makes sense.
      return;
    }
    // Saved. A free project joins the Library through an access event (a paid one already has its purchase row).
    logFreeAccessIfNeeded("download");
    haptics.success();
    toast("Saved to your library for offline use", { variant: "success" });
    // Take them to it — but only if they're still looking at this page; if they've gone elsewhere, don't yank them back.
    if (mountedRef.current) {
      setOfflineSheetOpen(false);
      router.navigate(`/library?tab=${libraryTabForType(project.project_type)}&highlight=${project.id}` as Href);
    }
  }

  // The plain single-project purchase.
  async function buyThisOnly() {
    if (!requireUser()) return;
    try {
      await purchaseProject.mutateAsync(project.id);
    } catch (err) {
      notifyError(err, "Purchase failed.");
    }
  }

  // Buy tap: if one of the creator's offers contains this project, suggest it first (the sheet itself offers
  // "just this one"); otherwise buy straight away.
  async function handleBuy() {
    if (!requireUser()) return;
    const suggestable = !isFree && OFFER_ELIGIBLE_TYPES.includes(project.project_type);
    if (suggestable && (await offerNudge.offerBeforeBuy())) return;
    await buyThisOnly();
  }

  function handleJoinRoom() {
    if (hasAccess) router.push(`/rooms/${project.id}` as Href);
    else void handleBuy();
  }

  async function handleBookTalent() {
    if (!requireUser()) return;
    try {
      const { conversationId } = await bookTalent.mutateAsync(project.id);
      router.push(`/messages/${conversationId}` as Href);
    } catch (err) {
      notifyError(err, "Booking failed.");
    }
  }

  async function handleMessage(draftMessage?: string) {
    if (!requireUser()) return;
    try {
      const conversationId = await startConversation.mutateAsync(project.owner_id);
      router.push((draftMessage ? { pathname: "/messages/[conversationId]", params: { conversationId, draftMessage } } : `/messages/${conversationId}`) as Href);
    } catch (err) {
      notifyError(err, "Couldn't start conversation.");
    }
  }

  async function handleShare() {
    setMenuOpen(false);
    const url = shareUrl ?? `${APP_URL}/projects/${project.id}`;
    try {
      await Share.share({ message: url, url, title: project.title });
    } catch {
      /* dismissed */
    }
  }

  /** Signed-URL downloads open in the system browser, which handles save/preview. */
  async function openSigned(mutation: ReturnType<typeof useGetProjectFile>, args: Parameters<ReturnType<typeof useGetProjectFile>["mutateAsync"]>[0], fallback: string) {
    if (!requireUser()) return;
    try {
      const url = await mutation.mutateAsync(args);
      await Linking.openURL(url);
      logFreeAccessIfNeeded("download");
    } catch (err) {
      notifyError(await resolveFunctionErrorMessage(err, fallback), fallback);
    }
  }

  /** File projects download in-app so the download only counts once every byte is on the device. */
  async function handleDownloadFile(file?: ProjectFile) {
    if (!requireUser()) return;
    try {
      // A specific file from the list, or the project's first (a one-file project).
      const target = file ?? projectFiles?.[0] ?? null;
      await downloadProjectFile.mutateAsync({
        projectId: project.id,
        fileId: target?.id ?? null,
        fileName: target?.download_name ?? null,
        title: project.title,
        filePath: project.file_path,
      });
      logFreeAccessIfNeeded("download");
    } catch (err) {
      if (err instanceof DownloadCancelledError) return; // the person stopped it — not an error
      notifyError(await resolveFunctionErrorMessage(err, "Couldn't download the file."), "Couldn't download the file.");
    }
  }

  /** "Download all" for a multi-file project: as one zip, or one by one into a folder. The whole batch counts as one download. */
  async function handleDownloadAll(mode: DownloadAllMode) {
    if (!requireUser()) return;
    try {
      const saved = await downloadAllFiles.mutateAsync({ projectId: project.id, title: project.title, mode });
      logFreeAccessIfNeeded("download");
      if (mode === "each") toast(`Saved ${saved} files`, { variant: "success" });
    } catch (err) {
      if (err instanceof DownloadCancelledError) return; // the person stopped it — not an error
      notifyError(await resolveFunctionErrorMessage(err, "Couldn't download the files."), "Couldn't download the files.");
    }
  }

  async function loadStream(mutation: ReturnType<typeof useGetProjectFile>, kind: "audio" | "video" | "image", set: (url: string) => void, fallback: string) {
    if (!requireUser()) return;
    try {
      const url = await mutation.mutateAsync({ projectId: project.id, kind });
      set(url);
      logFreeAccessIfNeeded("stream");
    } catch (err) {
      notifyError(await resolveFunctionErrorMessage(err, fallback), fallback);
    }
  }
  const handlePlayAudio = () => loadStream(getAudioStream, "audio", setAudioSrc, "Couldn't load audio.");
  const handlePlayVideo = () => loadStream(getVideoStream, "video", setVideoSrc, "Couldn't load video.");
  const handleViewImage = () => loadStream(getImageStream, "image", setImageSrc, "Couldn't load image.");

  async function copyText(text: string, onDone: () => void) {
    try {
      await Clipboard.setStringAsync(text);
      onDone();
    } catch {
      notifyError("Couldn't copy link.", "Couldn't copy link.");
    }
  }

  function openExternal(url: string | null | undefined, kind: "link_click" = "link_click") {
    if (!url) return;
    logFreeAccessIfNeeded(kind);
    void openExternalGuarded(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  }

  function handleStatusChange(status: "active" | "draft" | "archived") {
    setStatus.mutate({ id: project.id, status });
    setMenuOpen(false);
  }

  async function handleConfirmDelete() {
    setShowDeleteConfirm(false);
    try {
      await deleteProject.mutateAsync(project.id);
      toast(`${project.title} deleted.`, { variant: "success" });
    } catch (err) {
      notifyError(err, "Couldn't delete this project.");
    }
  }

  const ink = colors.ink;
  const mk = (as: LucideIcon, color = ink, fill = "none") => {
    const C = as;
    return <C size={24} color={color} fill={fill} />;
  };

  const middleActions: EngagementAction[] = [
    ...(!isOwner
      ? [
          {
            key: "save",
            label: isSaved ? "Saved" : "Save",
            icon: mk(Bookmark, isSaved ? colors.accent : ink, isSaved ? colors.accent : "none"),
            count: null,
            onClick: () => (requireUser() ? toggleSaved.mutate(isSaved) : undefined),
          } satisfies EngagementAction,
        ]
      : []),
    ...(isMedia && !isOwner
      ? [{ key: "gift", label: "Gift", icon: mk(GiftIcon), count: null, onClick: openGift } satisfies EngagementAction]
      : []),
    ...(isRoom
      ? [
          {
            key: "join",
            label: hasAccess ? "Enter cohort" : "Join cohort",
            icon: mk(Users, hasAccess ? colors.accent : ink, hasAccess ? colors.accent : "none"),
            count: null,
            onClick: handleJoinRoom,
          } satisfies EngagementAction,
        ]
      : []),
    ...(!isOwner ? [{ key: "share", label: "Share", icon: mk(Redo2), count: null, onClick: () => void handleShare() } satisfies EngagementAction] : []),
  ];
  const rightActions: EngagementAction[] =
    middleActions.length > 0 ? [{ key: "more", label: "More", icon: mk(MoreHorizontal), count: null, onClick: () => setShowMoreActions(true) }] : [];

  // Supporting images only exist on the project's own page (swipe the thumbnail). Every list, grid and rail renders isDetailView=false → plain thumbnail.
  const galleryImages = isDetailView ? projectGalleryImages(project) : [];
  // Clamped ratio + height cap: a tall poster or wide banner must not blow the card up past the screen.
  const { height: windowHeight } = useWindowDimensions();
  const thumb = thumbnailLayout(project.thumbnail_width, project.thumbnail_height, project.project_type);
  const aspectRatio = thumb.aspectRatio;
  // Books are exactly 2:3 — no height cap, or the box would stop being 2:3 and crop the cover.
  const thumbMaxHeight = project.project_type === "book" ? undefined : windowHeight * MAX_THUMB_HEIGHT_VH;
  const TypeIcon = TYPE_ICON[project.project_type];
  const primaryMediaKind: "audio" | "video" | null =
    isMedia && mediaDetails?.has_video && mediaDetails.video_file_path ? "video" : isMedia && mediaDetails?.has_audio && mediaDetails.audio_file_path ? "audio" : null;
  const showOwnerBadges = isOwner && (project.status !== "active" || project.is_private);
  const accessCount = accessCountQuery.data ?? 0;

  const ownerMenuItems: (DropdownMenuItem | "divider")[] = [
    { key: "edit", label: "Edit", icon: <Icon as={Pencil} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/projects/${project.id}/edit` as Href) },
    ...(canEditBookContent ? [{ key: "edit-book-contents", label: "Edit book contents", icon: <Icon as={BookOpen} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/books/${project.id}/edit` as Href) }] : []),
    { key: "share", label: "Share", icon: <Icon as={Redo2} size={22} className="text-overlay-ink" />, onSelect: handleShare },
    ...(project.status === "active" && !project.is_private
      ? [
          {
            key: "push",
            label: "Push",
            icon: <Icon as={Megaphone} size={22} className="text-overlay-ink" />,
            onSelect: () => router.push({ pathname: "/compose", params: { taggedProjectId: project.id, taggedProjectTitle: project.title } } as Href),
          } satisfies DropdownMenuItem,
        ]
      : []),
    ...(project.is_private
      ? [{ key: "manage-access", label: "Manage access", icon: <Icon as={Users} size={22} className="text-overlay-ink" />, onSelect: () => setManageAccessOpen(true) } satisfies DropdownMenuItem]
      : []),
    ...(project.status === "active"
      ? [{ key: "guest-pass", label: "Guest Pass", icon: <Icon as={KeyRound} size={22} className="text-overlay-ink" />, onSelect: () => setGuestPassOpen(true) } satisfies DropdownMenuItem]
      : []),
    ...(project.status !== "active" && project.status !== "cancelled"
      ? [{ key: "publish", label: "Publish", icon: <Icon as={Send} size={22} className="text-overlay-ink" />, onSelect: () => handleStatusChange("active") } satisfies DropdownMenuItem]
      : []),
    ...(project.status === "active"
      ? [{ key: "unpublish", label: "Unpublish", icon: <Icon as={EyeOff} size={22} className="text-overlay-ink" />, onSelect: () => handleStatusChange("draft") } satisfies DropdownMenuItem]
      : []),
    ...(project.status !== "archived"
      ? [
          {
            key: "archive",
            label: "Archive",
            variant: "danger" as const,
            icon: <Icon as={Archive} size={22} className="text-overlay-danger" />,
            onSelect: () => handleStatusChange("archived"),
          } satisfies DropdownMenuItem,
        ]
      : []),
    ...(project.status === "archived"
      ? [{ key: "restore", label: "Restore", icon: <Icon as={RotateCcw} size={22} className="text-overlay-ink" />, onSelect: () => handleStatusChange("draft") } satisfies DropdownMenuItem]
      : []),
    "divider",
    {
      key: "delete",
      label: deleteProject.isPending ? "Deleting…" : "Delete",
      variant: "danger",
      icon: <Icon as={Trash2} size={22} className="text-overlay-danger" />,
      disabled: deleteProject.isPending,
      onSelect: () => setShowDeleteConfirm(true),
    },
  ];

  const typeRouteBtn = !INLINE_TYPES.includes(project.project_type) && !isMedia && !isBook && hasAccess && TYPE_ROUTE[project.project_type];

  // ---- Detail-view action bar (ProjectDetail only) ----------------------------------------------
  // One primary CTA fills ~90% of the row; a single "···" takes the rest. Save, Share and every
  // secondary action live ONLY in that menu (the old tray repeated them in two places).
  type DetailCta = { label: string; icon?: LucideIcon; onPress: () => void; disabled?: boolean; /** 0–100: fills the button left to right. */ progress?: number | null };
  const priceLabel = `$${effectivePrice.toFixed(2)}`;
  const bookUpload = isBook && bookDetails?.content_source === "upload";
  const bookReadsInApp = bookUpload && !!bookDetails?.allow_read_in_app;
  const bookCanDownload = bookUpload && !!bookDetails?.allow_download;
  const talentBookable = project.project_type === "gig" && !isOwner && !isFree && !hasPurchased;
  const openBookReader = () => {
    if (!requireUser()) return;
    router.push(`/projects/${project.id}/read` as Href);
    logFreeAccessIfNeeded("stream");
  };
  const downloadBook = () => void openSigned(getBookDownload, { projectId: project.id, kind: "book", action: "download" }, "Couldn't access file.");

  // What a signed-out visitor's primary button says: the action they'd get once in. Tapping it opens login, never the content.
  const hasMediaLink = isMedia && ((!!mediaDetails?.has_audio && !!mediaDetails.audio_url) || (!!mediaDetails?.has_video && !!mediaDetails.video_url));
  const guestCta: { label: string; icon?: LucideIcon } = (() => {
    if (project.project_type === "file") return { label: "Download", icon: Download };
    if (project.project_type === "url") return { label: "Open link", icon: LinkIcon };
    if (isBook) {
      if (bookDetails?.content_source === "link") return { label: "Open link", icon: LinkIcon };
      if (!bookReadsInApp && bookCanDownload) return { label: "Download", icon: Download };
      return { label: "Read", icon: BookText };
    }
    if (isMedia) {
      const isAudio = !!mediaDetails?.has_audio && !!mediaDetails.audio_url;
      return { label: isAudio ? "Listen" : "Watch", icon: isAudio ? Music : Video };
    }
    if (project.project_type === "event") return { label: "Get ticket", icon: TypeIcon };
    if (project.project_type === "meeting") return { label: "Join meeting", icon: TypeIcon };
    if (project.project_type === "course") return { label: "Start course", icon: TypeIcon };
    return { label: "Continue" };
  })();

  let detailCta: DetailCta | null = null;
  if (isPitch) {
    if (!isOwner) detailCta = { label: "Support", icon: Heart, onPress: openSupport };
  } else if (project.project_type === "gig") {
    if (!isOwner) {
      detailCta = talentBookable
        ? { label: bookTalent.isPending ? "Booking…" : `Book for ${priceLabel}`, onPress: () => void handleBookTalent(), disabled: bookTalent.isPending }
        : { label: startConversation.isPending ? "Opening…" : "Message", icon: MessageCircle, onPress: () => void handleMessage(), disabled: startConversation.isPending };
    }
  } else if (isRoom) {
    detailCta = hasAccess
      ? { label: "Enter cohort", icon: Users, onPress: handleJoinRoom }
      : { label: purchaseProject.isPending ? "Joining…" : isFree ? "Join cohort" : `Join for ${priceLabel}`, icon: Users, onPress: handleJoinRoom, disabled: purchaseProject.isPending };
  } else if (!user && isFree && !isCourseUnpublished && !isBookDraftUnpublished) {
    // Signed-out visitor on a FREE project: no price to show ("Buy for $0.00" reads wrong).
    detailCta = isMedia && !hasMediaLink ? { label: "Gift", icon: GiftIcon, onPress: openGift } : { label: guestCta.label, icon: guestCta.icon, onPress: redirectToLogin };
  } else if (!hasAccess) {
    if (!isCourseUnpublished && !isBookDraftUnpublished) {
      detailCta = {
        label: purchaseProject.isPending
          ? "Purchasing…"
          : project.project_type === "event"
            ? `Buy ticket ${priceLabel}`
            : project.project_type === "url"
              ? `Get access for ${priceLabel}`
              : `Buy for ${priceLabel}`,
        onPress: () => void handleBuy(),
        disabled: buyBusy,
      };
    }
  } else if (project.project_type === "file") {
    // While it runs, the button fills with progress and a tap cancels. At 100% the file is on the device and counted;
    // the mutation only settles once the system save sheet closes, so don't keep offering Cancel then.
    const dl = downloadProjectFile;
    const dlSaving = dl.isPending && dl.progress === 100;
    // Several files: "Download all" (zip, or one by one) is the primary action; each file in the list also has its own
    // Download button for taking just one.
    const da = downloadAllFiles;
    const daSaving = da.isPending && da.progress === 100;
    detailCta = isMultiFile ? {
      label: daSaving
        ? "Download complete"
        : da.isPending
          ? `${da.status ?? "Preparing…"}${da.progress != null ? ` · ${da.progress}%` : ""} · Cancel`
          : "Download all",
      icon: Download,
      onPress: () => (da.isPending ? da.cancel() : setDownloadAllOpen(true)),
      disabled: daSaving || dl.isPending,
      progress: da.isPending ? da.progress : null,
    } : {
      label: dlSaving ? "Download complete" : dl.isPending ? `${dl.progress != null ? `Downloading ${dl.progress}%` : "Preparing…"} · Cancel` : "Download",
      icon: Download,
      onPress: () => (dl.isPending ? dl.cancel() : void handleDownloadFile()),
      disabled: dlSaving,
      progress: dl.isPending ? dl.progress : null,
    };
  } else if (project.project_type === "url") {
    detailCta = { label: "Open link", icon: LinkIcon, onPress: () => openExternal(project.external_url) };
  } else if (isBook) {
    if (bookDetails?.content_source === "link") detailCta = { label: "Open link", icon: LinkIcon, onPress: () => openExternal(bookDetails.external_url) };
    else if (bookReadsInApp) detailCta = { label: "Read", icon: BookText, onPress: openBookReader };
    else if (bookCanDownload) detailCta = { label: getBookDownload.isPending ? "Preparing…" : "Download", icon: Download, onPress: downloadBook, disabled: getBookDownload.isPending };
    else if (bookDetails?.content_source === "authored") {
      detailCta = { label: canEditBookContent && !project.published_at ? "Continue building" : "Read", icon: BookOpen, onPress: () => router.push((canEditBookContent && !project.published_at ? `/books/${project.id}/edit` : `/books/${project.id}`) as Href) };
    }
  } else if (isMedia) {
    const audioUrl = mediaDetails?.has_audio ? mediaDetails.audio_url : null;
    const videoUrl = mediaDetails?.has_video ? mediaDetails.video_url : null;
    if (audioUrl) detailCta = { label: "Listen", icon: Music, onPress: () => openExternal(audioUrl) };
    else if (videoUrl) detailCta = { label: "Watch", icon: Video, onPress: () => openExternal(videoUrl) };
    else if (!isOwner) detailCta = { label: "Gift", icon: GiftIcon, onPress: openGift };
  } else if (typeRouteBtn) {
    detailCta = {
      label: project.project_type === "event" && isOwner ? "Scan tickets" : (TYPE_ACTION_LABEL[project.project_type] ?? "Open"),
      icon: TypeIcon ?? LinkIcon,
      onPress: () => router.push((project.project_type === "event" && isOwner ? `/projects/${project.id}/checkin` : TYPE_ROUTE[project.project_type]!(project.id)) as Href),
    };
  }

  // Hold the CTA slot steady until the data that decides WHICH button this is has landed. Before, a buyer's own book
  // showed "Buy for $X" (has-purchased loading) or nothing (book details loading), then swapped to "Read" under the
  // finger — the tap hit the wrong/absent button and only the second press worked.
  const ctaAccessPending = !!user && !isOwner && !isFree && hasPurchasedQuery.isLoading;
  const ctaBookPending = isBook && bookDetailsLoading;
  if (isDetailView && !isPitch && project.project_type !== "gig" && !isRoom && (ctaAccessPending || ctaBookPending)) {
    detailCta = { label: "Loading…", onPress: () => {}, disabled: true };
  }

  const menuIcon = (as: LucideIcon) => <Icon as={as} size={22} className="text-overlay-ink" />;
  const visitorMenuItems: (DropdownMenuItem | "divider")[] = [
    { key: "save", label: isSaved ? "Saved" : "Save", icon: menuIcon(Bookmark), onSelect: () => { if (requireUser()) toggleSaved.mutate(isSaved); } },
    { key: "share", label: "Share", icon: menuIcon(Redo2), onSelect: handleShare },
    ...(isMedia ? [{ key: "gift", label: "Gift", icon: menuIcon(GiftIcon), onSelect: openGift } satisfies DropdownMenuItem] : []),
    ...(talentBookable ? [{ key: "message", label: "Message", icon: menuIcon(MessageCircle), onSelect: () => void handleMessage() } satisfies DropdownMenuItem] : []),
    ...(project.project_type === "url" && hasAccess && project.external_url
      ? [{ key: "copy-link", label: "Copy link", icon: menuIcon(Copy), onSelect: () => void copyText(project.external_url!, () => flash(setLinkCopied)) } satisfies DropdownMenuItem]
      : []),
    ...(hasAccess && bookReadsInApp && bookCanDownload ? [{ key: "download", label: "Download", icon: menuIcon(Download), onSelect: downloadBook } satisfies DropdownMenuItem] : []),
    // Lives in the options menu, never beside the main button (Read / Start course / …), so the primary action stays one clear thing.
    ...(offline.isSaved
      ? [
          {
            key: "offline-remove",
            label: "Remove download",
            icon: menuIcon(Trash2),
            badge: <Text className="text-xs text-overlay-ink-muted">{formatBytes(offline.entry?.bytes ?? 0)}</Text>,
            onSelect: () => setConfirmRemoveOffline(true),
          } satisfies DropdownMenuItem,
        ]
      : offline.isBusy
        ? [{ key: "offline-progress", label: `Downloading… ${Math.round(offline.state.progress * 100)}%`, icon: menuIcon(ArrowDownToLine), onSelect: () => setOfflineSheetOpen(true) } satisfies DropdownMenuItem]
        : offlineEligible
          ? [{ key: "offline", label: "Download to library", icon: menuIcon(ArrowDownToLine), onSelect: () => void beginOfflineDownload() } satisfies DropdownMenuItem]
          : []),
  ];
  const detailMenuItems = isOwner ? ownerMenuItems : visitorMenuItems;
  const isDark = resolvedTheme === "dark";

  return (
    <View
      className="relative mb-4 overflow-hidden rounded-[28px] border border-border-a60 bg-surface"
      style={{ shadowColor: `rgb(${colors.shadowInkRgb})`, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 3 }}
    >
      <View style={{ aspectRatio, maxHeight: thumbMaxHeight }} className="w-full items-center justify-center overflow-hidden bg-canvas">
        {primaryMediaKind ? (
          <MediaHeroPlayer
            kind={primaryMediaKind}
            thumbnailUrl={project.thumbnail_url}
            hasAccess={hasAccess}
            previewSrc={primaryMediaKind === "video" ? videoSrc : audioSrc}
            isLoadingPreview={primaryMediaKind === "video" ? getVideoStream.isPending : getAudioStream.isPending}
            onLoadPreview={primaryMediaKind === "video" ? handlePlayVideo : handlePlayAudio}
            autoLoadOnMount={!!isDetailView}
            visible={visible}
            fit={thumb.fit}
          />
        ) : project.project_type === "file" ? (
          // File projects never use a thumbnail: the folder stands in, with the download count under it.
          <FileFolderHero downloadCount={project.download_count ?? 0} fill />
        ) : project.thumbnail_url && isDetailView && galleryImages.length > 1 ? (
          <ProjectImageCarousel images={galleryImages} fit={thumb.fit} />
        ) : project.thumbnail_url ? (
          <Pressable
            onPress={() => !isDetailView && router.push(`/projects/${project.id}` as Href)}
            disabled={!!isDetailView}
            accessibilityRole={isDetailView ? "image" : "link"}
            className="h-full w-full"
          >
            <Image source={{ uri: project.thumbnail_url }} contentFit={thumb.fit} transition={150} style={{ width: "100%", height: "100%" }} />
          </Pressable>
        ) : (
          <Icon as={ImageIcon} size={32} className="text-ink-muted" />
        )}
      </View>

      {showOwnerBadges ? (
        <View className="absolute left-3 top-3 flex-row items-center gap-1.5">
          {project.status !== "active" ? (
            <View className="rounded-full bg-ink-a85 px-2.5 py-1">
              <Text className="text-xs font-medium text-canvas">{project.status === "draft" ? "Draft" : project.status === "cancelled" ? "Cancelled" : "Archived"}</Text>
            </View>
          ) : null}
          {project.is_private ? (
            <View className="flex-row items-center gap-1 rounded-full bg-ink-a70 px-2.5 py-1">
              <Icon as={EyeOff} size={10} className="text-canvas" />
              <Text className="text-xs font-medium text-canvas">Private</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {isOwner && !isDetailView ? (
        <View className="absolute right-3 top-3">
          <View ref={menuButtonRef} collapsable={false}>
            <Pressable
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Project options"
              className="rounded-full bg-canvas-a90 p-1.5"
              style={{ elevation: 3 }}
            >
              <Icon as={MoreHorizontal} size={16} className="text-ink-muted" />
            </Pressable>
          </View>
          {menuOpen ? <DropdownMenu title="Project options" anchorRef={menuButtonRef} onClose={() => setMenuOpen(false)} width={224} items={ownerMenuItems} /> : null}
        </View>
      ) : null}

      <View className="p-5">
        <View className="flex-row items-start justify-between gap-3">
          <Pressable
            onPress={() => !isDetailView && router.push(`/projects/${project.id}` as Href)}
            disabled={!!isDetailView}
            accessibilityRole={isDetailView ? "header" : "link"}
            className="min-w-0 flex-1"
          >
            <Text numberOfLines={1} className="font-display text-lg font-semibold tracking-tight text-ink">
              {project.title}
            </Text>
            <View className="mt-0.5 flex-row items-center gap-2">
              <Text className="text-xs text-ink-muted">{PROJECT_TYPE_LABELS[project.project_type]}</Text>
              {accessCount > 0 ? (
                <View className="flex-row items-center gap-1">
                  <View className="h-1 w-1 rounded-full bg-ink-muted-a50" />
                  <Icon as={Eye} size={11} className="text-ink-muted" />
                  <Text className="text-xs text-ink-muted">{accessCount}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>

          <View className="shrink-0 items-end">
            {isPitch ? (
              <PricePill>{`$${(pitchRaised ?? 0).toFixed(0)} raised`}</PricePill>
            ) : isFree && project.project_type === "gig" ? (
              <PricePill>Message to inquire</PricePill>
            ) : isFree ? (
              <PricePill>Free</PricePill>
            ) : showPromo ? (
              <View className="flex-row items-center gap-1.5">
                <Text className="text-xs text-ink-muted" style={{ textDecorationLine: "line-through" }}>
                  ${project.price_usd.toFixed(2)}
                </Text>
                <PricePill>{`$${effectivePrice.toFixed(2)}`}</PricePill>
              </View>
            ) : (
              <PricePill tone="outline">{`$${project.price_usd.toFixed(2)}`}</PricePill>
            )}
          </View>
        </View>

        {privacyBlocked ? (
          <PrivateProjectNotice onMessage={() => void handleMessage(`Hi! I'd like access to "${project.title}".`)} messagePending={startConversation.isPending} />
        ) : (
          <UnlockReveal unlocked={hasAccess}>
            {concealDetails ? (
              <Pressable
                onPress={() => setDetailsOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityState={{ expanded: detailsOpen }}
                className="mt-3 w-full flex-row items-center justify-between rounded-2xl border border-border-a60 bg-canvas px-4 py-2.5 active:opacity-90"
              >
                <Text className="text-sm font-medium text-ink">Details</Text>
                <View style={{ transform: [{ rotate: detailsOpen ? "180deg" : "0deg" }] }}>
                  <Icon as={ChevronDown} size={16} className="text-ink-muted" />
                </View>
              </Pressable>
            ) : null}

            {showDetails && project.description ? (
              <Text className={`${concealDetails ? "mt-3" : "mt-1"} text-sm text-ink-muted`}>{renderFormattedText(project.description, "d")}</Text>
            ) : null}

            {isDetailView && isMultiFile && projectFiles && projectFiles.length > 0 ? (
              <ProjectFilesList
                files={projectFiles}
                hasAccess={hasAccess}
                busy={downloadProjectFile.isPending || downloadAllFiles.isPending}
                activeFileId={downloadProjectFile.isPending ? (downloadProjectFile.variables?.fileId ?? null) : null}
                progress={downloadProjectFile.progress}
                onDownload={(file) => void handleDownloadFile(file)}
                onCancel={() => downloadProjectFile.cancel()}
              />
            ) : null}

            {/* Goal progress — informational only; hitting or missing the goal changes nothing about what's already pledged. */}
            {showDetails && isPitch && pitchDetails ? (
              <View className="mt-2.5">
                <View className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                  <View className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, ((pitchRaised ?? 0) / pitchDetails.goal_amount_usd) * 100)}%` }} />
                </View>
                <Text className="mt-1 text-xs text-ink-muted">
                  ${(pitchRaised ?? 0).toFixed(0)} raised of ${pitchDetails.goal_amount_usd.toFixed(0)} goal
                </Text>
              </View>
            ) : null}

            {concealDetails && detailsOpen && detailsSlot ? <View className="mt-4">{detailsSlot}</View> : null}

            {/* Media: the playable preview is the card's thumbnail; this holds the "full thing" links and the private image. */}
            {isMedia && mediaDetails ? (
              <View className="mt-3 gap-3">
                {isDetailView
                  ? null
                  : mediaDetails.has_audio && mediaDetails.has_video
                  ? hasAccess && mediaDetails.audio_url
                    ? <LinkAction icon={Music} label="Listen to the full song" onPress={() => openExternal(mediaDetails.audio_url)} />
                    : null
                  : mediaDetails.has_audio
                    ? hasAccess && mediaDetails.audio_url
                      ? <LinkAction icon={Music} label="Go to full track" onPress={() => openExternal(mediaDetails.audio_url)} />
                      : null
                    : hasAccess && mediaDetails.video_url
                      ? <LinkAction icon={Video} label="Go to full video" onPress={() => openExternal(mediaDetails.video_url)} />
                      : null}

                {mediaDetails.has_image ? (
                  <View>
                    {!hasAccess ? (
                      <View className="flex-row items-center gap-1.5">
                        <Icon as={Lock} size={15} className="text-ink-muted" />
                        <Text className="text-sm text-ink-muted">Image locked</Text>
                      </View>
                    ) : imageSrc ? (
                      <View className="gap-2">
                        <Image source={{ uri: imageSrc }} contentFit="contain" style={{ width: "100%", height: 288, borderRadius: 8 }} />
                        <View className="flex-row items-center gap-4">
                          <LinkAction icon={Download} label="Download" onPress={() => void Linking.openURL(imageSrc)} />
                          <LinkAction
                            icon={imageLinkCopied ? Check : Copy}
                            label={imageLinkCopied ? "Copied" : "Copy link"}
                            muted
                            onPress={() => void copyText(imageSrc, () => flash(setImageLinkCopied))}
                          />
                        </View>
                        <Text className="text-xs text-ink-muted">Link expires after a while — copy again if it stops working.</Text>
                      </View>
                    ) : (
                      <LinkAction icon={ImageIcon} label={getImageStream.isPending ? "Loading…" : "View image"} onPress={() => void handleViewImage()} disabled={getImageStream.isPending} />
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Book: three content sources, three different actions. */}
            {!isDetailView && isBook && bookDetails && hasAccess ? (
              <View className="mt-3 gap-3">
                {bookDetails.content_source === "link" ? (
                  <LinkAction icon={LinkIcon} label="Open link" onPress={() => openExternal(bookDetails.external_url)} />
                ) : null}
                {bookDetails.content_source === "upload" ? (
                  <View className="flex-row items-center gap-4">
                    {bookDetails.allow_read_in_app ? (
                      <LinkAction
                        icon={BookText}
                        label="Read"
                        onPress={() => {
                          if (!requireUser()) return;
                          logFreeAccessIfNeeded("stream");
                          router.push(`/projects/${project.id}/read` as Href);
                        }}
                      />
                    ) : null}
                    {bookDetails.allow_download ? (
                      <LinkAction
                        icon={Download}
                        label={getBookDownload.isPending ? "Preparing…" : "Download"}
                        disabled={getBookDownload.isPending}
                        onPress={() => void openSigned(getBookDownload, { projectId: project.id, kind: "book", action: "download" }, "Couldn't access file.")}
                      />
                    ) : null}
                  </View>
                ) : null}
                {bookDetails.content_source === "authored" ? (
                  <LinkAction
                    icon={BookOpen}
                    label={canEditBookContent && !project.published_at ? "Continue building" : "Read"}
                    onPress={() => router.push((canEditBookContent && !project.published_at ? `/books/${project.id}/edit` : `/books/${project.id}`) as Href)}
                  />
                ) : null}
              </View>
            ) : null}
            {!isDetailView && isBook && bookDetails && !hasAccess && !isOwner ? (
              <View className="mt-3">
                <LockedNote />
              </View>
            ) : null}

            {!isDetailView ? (
            <View className="mt-3 flex-row items-center gap-2">
              {project.project_type === "file" ? (
                hasAccess && isMultiFile ? (
                  <LinkAction
                    icon={Download}
                    label={
                      downloadAllFiles.isPending
                        ? downloadAllFiles.progress === 100
                          ? "Download complete"
                          : `${downloadAllFiles.status ?? "Preparing…"}${downloadAllFiles.progress != null ? ` · ${downloadAllFiles.progress}%` : ""}`
                        : `Download all (${fileCount} files)`
                    }
                    disabled={downloadAllFiles.isPending || downloadProjectFile.isPending}
                    onPress={() => setDownloadAllOpen(true)}
                  />
                ) : hasAccess ? (
                  <LinkAction
                    icon={Download}
                    label={
                      downloadProjectFile.isPending
                        ? downloadProjectFile.progress === 100
                          ? "Download complete"
                          : downloadProjectFile.progress != null
                            ? `Downloading ${downloadProjectFile.progress}%`
                            : "Preparing…"
                        : "Download"
                    }
                    disabled={downloadProjectFile.isPending}
                    onPress={() => void handleDownloadFile()}
                  />
                ) : (
                  <LockedNote />
                )
              ) : null}

              {project.project_type === "url" ? (
                hasAccess ? (
                  <View className="flex-row items-center gap-4">
                    <LinkAction icon={LinkIcon} label="Open link" onPress={() => openExternal(project.external_url)} />
                    <LinkAction
                      icon={linkCopied ? Check : Copy}
                      label={linkCopied ? "Copied" : "Copy"}
                      muted
                      onPress={() => project.external_url && void copyText(project.external_url, () => flash(setLinkCopied))}
                    />
                  </View>
                ) : (
                  <LockedNote />
                )
              ) : null}

              {typeRouteBtn ? (
                <LinkAction
                  icon={TypeIcon ?? LinkIcon}
                  label={project.project_type === "event" && isOwner ? "Scan tickets" : (TYPE_ACTION_LABEL[project.project_type] ?? "Open")}
                  onPress={() =>
                    router.push((project.project_type === "event" && isOwner ? `/projects/${project.id}/checkin` : TYPE_ROUTE[project.project_type]!(project.id)) as Href)
                  }
                />
              ) : null}

              {!INLINE_TYPES.includes(project.project_type) && !isMedia && !isBook && project.project_type !== "gig" && !isPitch && !hasAccess && !isCourseUnpublished ? (
                <LockedNote />
              ) : null}

              {isCourseUnpublished && isOwner ? <Text className="text-sm text-ink-muted">Not published yet</Text> : null}
              {isBookDraftUnpublished && isOwner ? <Text className="text-sm text-ink-muted">Not published yet</Text> : null}

              {/* Talent: Message is always available (lead-gen first), plus an optional paid "Book" once a fee is set. */}
              {project.project_type === "gig" && !isOwner ? (
                <LinkAction icon={MessageCircle} label={startConversation.isPending ? "Opening…" : "Message"} disabled={startConversation.isPending} onPress={() => void handleMessage()} />
              ) : null}
              {project.project_type === "gig" && !isOwner && !isFree && hasPurchased ? <Text className="ml-2 text-sm text-ink-muted">Booked ✓</Text> : null}

              {isPitch && !isOwner ? (
                <Pressable
                  onPress={openSupport}
                  accessibilityRole="button"
                  className="ml-auto flex-row items-center gap-1.5 rounded-full bg-cta px-4 py-1.5 active:scale-[0.97]"
                  style={{ elevation: 3 }}
                >
                  <Icon as={Heart} size={15} className="text-white" />
                  <Text className="text-sm font-semibold text-white">Support</Text>
                </Pressable>
              ) : null}

              {!isRoom && !isPitch && !hasAccess && !isCourseUnpublished && !isBookDraftUnpublished ? (
                <Pressable
                  onPress={project.project_type === "gig" ? handleBookTalent : handleBuy}
                  disabled={project.project_type === "gig" ? bookTalent.isPending : buyBusy}
                  accessibilityRole="button"
                  className={`ml-auto rounded-full bg-cta px-4 py-1.5 active:scale-[0.97] ${(project.project_type === "gig" ? bookTalent.isPending : purchaseProject.isPending) ? "opacity-50" : ""}`}
                  style={{ elevation: 3 }}
                >
                  <Text className="text-sm font-semibold text-white">
                    {project.project_type === "gig"
                      ? bookTalent.isPending ? "Booking…" : `Book for $${effectivePrice.toFixed(2)}`
                      : purchaseProject.isPending
                        ? "Purchasing…"
                        : project.project_type === "event"
                          ? `Buy ticket $${effectivePrice.toFixed(2)}`
                          : project.project_type === "url"
                            ? `Get access for $${effectivePrice.toFixed(2)}`
                            : `Buy for $${effectivePrice.toFixed(2)}`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            ) : null}

            {/* ProjectDetail renders its own identical button right after the card, so skip it there. */}
            {canBecomeAffiliate && !isDetailView ? (
              <Pressable
                onPress={() => setAffiliateShareOpen(true)}
                accessibilityRole="button"
                className="mb-2 mt-3 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-accent-soft py-2.5 active:scale-[0.98]"
              >
                <Icon as={GitFork} size={15} className="text-accent" />
                <Text className="text-sm font-semibold text-accent">Fork & earn</Text>
              </Pressable>
            ) : null}

            {isDetailView ? (
              <>
                {/* Primary CTA (~90%) + one "···" (~10%, 48px min tap target). Light: green button, white "···" with
                    green icon. Dark: green button, dark "···" with white icon. */}
                <View className={`mt-4 flex-row items-stretch gap-2 ${detailCta ? "" : "justify-end"}`}>
                  {detailCta ? (
                    <Pressable
                      onPress={detailCta.onPress}
                      disabled={detailCta.disabled}
                      accessibilityRole="button"
                      className={`h-12 flex-row items-center justify-center gap-2 overflow-hidden rounded-2xl active:scale-[0.98] ${detailCta.disabled ? "opacity-50" : ""}`}
                      style={{ flex: 9, elevation: 3, backgroundColor: ctaFill(colors.accent) }}
                    >
                      {typeof detailCta.progress === "number" ? (
                        <View
                          pointerEvents="none"
                          className="absolute bottom-0 left-0 top-0"
                          style={{ width: `${Math.min(100, Math.max(0, detailCta.progress))}%`, backgroundColor: "rgba(255,255,255,0.22)" }}
                        />
                      ) : null}
                      {detailCta.icon ? <Icon as={detailCta.icon} size={18} className="text-white" /> : null}
                      <Text className="text-base font-semibold text-white">{detailCta.label}</Text>
                    </Pressable>
                  ) : null}
                  <View ref={menuButtonRef} collapsable={false} style={detailCta ? { flex: 1, minWidth: 48 } : { width: 48 }}>
                    <Pressable
                      onPress={() => setMenuOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel="More options"
                      className="h-12 items-center justify-center rounded-2xl border active:scale-[0.96]"
                      style={{
                        backgroundColor: isDark ? colors.canvas : "#FFFFFF",
                        borderColor: isDark ? colors.border : `${colors.accent}40`,
                      }}
                    >
                      <MoreHorizontal size={22} color={isDark ? colors.ink : colors.accent} />
                    </Pressable>
                  </View>
                </View>
                {(isCourseUnpublished || isBookDraftUnpublished) && isOwner ? <Text className="mt-2 text-sm text-ink-muted">Not published yet</Text> : null}
                {menuOpen ? <DropdownMenu title="Project options" anchorRef={menuButtonRef} onClose={() => setMenuOpen(false)} width={224} items={detailMenuItems} /> : null}
              </>
            ) : (
              <View className="mt-1 border-t border-border-a60 pt-3">
                <ReactionTray
                  leftActions={[]}
                  middleActions={middleActions}
                  rightActions={rightActions}
                  onOpenMore={isArchivedFrozen || middleActions.length === 0 ? undefined : () => setShowMoreActions(true)}
                  disabled={isArchivedFrozen}
                />
              </View>
            )}

            {!isDetailView && showMoreActions && !isArchivedFrozen && middleActions.length > 0 ? <ReactionMoreSheet actions={middleActions} onClose={() => setShowMoreActions(false)} /> : null}

            {showGiftPicker ? (
              <GiftPicker
                recipientId={project.owner_id}
                recipientName={project.title}
                recipientAvatar={project.thumbnail_url}
                projectId={project.id}
                onClose={() => setShowGiftPicker(false)}
              />
            ) : null}
          </UnlockReveal>
        )}
      </View>

      {manageAccessOpen ? <ManageAccessSheet projectId={project.id} projectTitle={project.title} onClose={() => setManageAccessOpen(false)} /> : null}
      {downloadAllOpen && isMultiFile ? (
        <OptionsModal
          title={`Download all (${fileCount} files)`}
          onClose={() => setDownloadAllOpen(false)}
          items={[
            {
              key: "zip",
              label: "As one zip",
              icon: menuIcon(FileArchive),
              description: canZipFiles(projectFiles ?? []) ? "A single .zip with every file inside" : "Too big for one zip (over 4 GB). Use one by one",
              disabled: !canZipFiles(projectFiles ?? []),
              onSelect: () => void handleDownloadAll("zip"),
            },
            {
              key: "each",
              label: "One by one",
              icon: menuIcon(Download),
              description: `Saves ${fileCount} separate files to a folder you pick${
                projectFiles && projectFiles.every((f) => f.size_bytes) ? ` (${formatFileSize(projectFiles.reduce((t, f) => t + (f.size_bytes ?? 0), 0))})` : ""
              }`,
              onSelect: () => void handleDownloadAll("each"),
            },
          ]}
        />
      ) : null}
      {guestPassOpen ? <GuestPassSheet projectId={project.id} projectTitle={project.title} isPrivate={project.is_private} isPaid={Number(project.price_usd) > 0} onClose={() => setGuestPassOpen(false)} /> : null}

      {supportSheetOpen ? (
        <SupportPitchSheet
          projectId={project.id}
          projectTitle={project.title}
          onClose={() => setSupportSheetOpen(false)}
          onSupported={() => {
            setSupportSheetOpen(false);
            toast("Thanks for backing this idea 🎉", { variant: "success" });
          }}
        />
      ) : null}

      {offerNudge.offers ? (
        <OfferNudgeSheet
          projectId={project.id}
          projectTitle={project.title}
          singlePrice={effectivePrice}
          offers={offerNudge.offers}
          onBuySingle={() => void buyThisOnly()}
          onClose={offerNudge.close}
        />
      ) : null}
      {affiliateShareOpen ? <AffiliateShareSheet projectId={project.id} projectTitle={project.title} onClose={() => setAffiliateShareOpen(false)} /> : null}

      {showDeleteConfirm ? (
        <ConfirmDialog
          title="Delete this project?"
          description="This can't be undone."
          confirmLabel={deleteProject.isPending ? "Deleting…" : "Delete"}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      ) : null}

      {offlineSheetOpen && (offline.isBusy || offline.state.phase === "failed") ? (
        <OfflineDownloadSheet
          title={project.title}
          state={offline.state}
          onCancel={offline.cancel}
          onRetry={() => void beginOfflineDownload(false)}
          onClose={() => {
            setOfflineSheetOpen(false);
            if (offline.state.phase === "failed") offline.dismissError();
          }}
        />
      ) : null}

      {cellularBytes !== null ? (
        <ConfirmDialog
          title="Download on mobile data?"
          description={`This is ${formatBytes(cellularBytes)}, and you're not on Wi-Fi, so it will use your data plan.`}
          confirmLabel="Download"
          danger={false}
          onConfirm={() => void beginOfflineDownload(true)}
          onCancel={() => setCellularBytes(null)}
        />
      ) : null}

      {confirmRemoveOffline ? (
        <ConfirmDialog
          title="Remove this download?"
          description="It will be removed from this device. You can download it again anytime."
          confirmLabel="Remove"
          danger={false}
          onConfirm={() => {
            setConfirmRemoveOffline(false);
            void offline.remove().then(() => toast("Download removed"));
          }}
          onCancel={() => setConfirmRemoveOffline(false)}
        />
      ) : null}
    </View>
  );
}

export const ProjectCard = memo(ProjectCardImpl);
