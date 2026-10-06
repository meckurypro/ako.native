// src/components/project/ProjectCard.tsx
// The project card: artwork (or a playable 30s preview for Media), type + price,
// description, then whatever the project's TYPE does once you have access —
// download a file, open a link, read a book, view a ticket, join a course /
// room / meeting — or the Buy / Book / Support control when you don't. Owners
// get a menu to edit, publish, archive, manage access, push to feed, or delete.
import {
  Archive,
  BookOpen,
  BookText,
  Bookmark,
  Briefcase,
  Check,
  Copy,
  Download,
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
  TrendingUp,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { router, type Href } from "expo-router";
import { memo, useRef, useState } from "react";
import { Pressable, Share, View } from "react-native";

import { ReactionMoreSheet } from "@/components/post/ReactionMoreSheet";
import { ReactionTray, type EngagementAction } from "@/components/post/ReactionTray";
import { GiftPicker } from "@/components/post/GiftPicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { UnlockReveal } from "@/components/ui/UnlockReveal";
import { useAffiliateProgram } from "@/hooks/useAffiliates";
import { useAuth } from "@/hooks/useAuth";
import { useStartConversation } from "@/hooks/useMessaging";
import { useProjectAccessCount, useLogFreeProjectAccess } from "@/hooks/useProjectAccess";
import { useIsProjectMember } from "@/hooks/useProjectMembers";
import { useBookDetails, useMediaDetails, usePitchDetails, usePitchRaised } from "@/hooks/useProjectTypeDetails";
import {
  getEffectivePrice,
  hasActivePromo,
  isProjectFree,
  PROJECT_TYPE_LABELS,
  useBookGig,
  useDeleteProject,
  useGetProjectFile,
  useHasPurchased,
  usePurchaseProject,
  useSetProjectStatus,
  type Project,
} from "@/hooks/useProjects";
import { useIsProjectSaved, useToggleSavedProject } from "@/hooks/useSavedProjects";
import { APP_URL } from "@/lib/config";
import { renderFormattedText } from "@/lib/formatText";
import { resolveFunctionErrorMessage } from "@/lib/functionErrors";
import { useTheme } from "@/theme/ThemeProvider";
import { AffiliateShareSheet } from "./AffiliateShareSheet";
import { ManageAccessSheet } from "./ManageAccessSheet";
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
  shareUrl?: string;
  /** True while the card is on screen — a playing preview stops when this goes false. */
  visible?: boolean;
}

function ProjectCardImpl({ project, isOwnerView, isDetailView, shareUrl, visible = true }: ProjectCardProps) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const isOwner = isOwnerView ?? user?.id === project.owner_id;
  const isArchivedFrozen = isOwner && project.status === "archived";
  const isFree = isProjectFree(project);
  const showPromo = hasActivePromo(project);
  const effectivePrice = getEffectivePrice(project);
  const isCourseUnpublished = project.project_type === "course" && !project.published_at;

  const hasPurchasedQuery = useHasPurchased(project.id);
  const purchaseProject = usePurchaseProject();
  const bookGig = useBookGig();
  const getFileDownload = useGetProjectFile();
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
  const { data: bookDetails } = useBookDetails(isBook ? project.id : undefined);
  const isBookDraftUnpublished = isBook && bookDetails?.content_source === "authored" && !project.published_at;
  const { data: affiliateProgram } = useAffiliateProgram(project.project_type !== "pitch" ? project.id : undefined);
  const canBecomeAffiliate = !!user && !isOwner && !!affiliateProgram?.enabled && project.price_usd > 0;
  const isMemberQuery = useIsProjectMember(project.id, project.is_private);

  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [manageAccessOpen, setManageAccessOpen] = useState(false);
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
  const hasAccess = !privacyBlocked && (isOwner || hasPurchased || (isFree && !isRoom));
  const isSaved = !!isSavedQuery.data;

  const redirectToLogin = () => router.push(`/login?redirect=${encodeURIComponent(`/projects/${project.id}`)}` as Href);
  const requireUser = (): boolean => {
    if (user) return true;
    redirectToLogin();
    return false;
  };
  const logFreeAccessIfNeeded = (accessType: "download" | "stream" | "link_click") => {
    if (isFree && !isOwner) logFreeAccess.mutate({ projectId: project.id, accessType });
  };
  const flash = (setter: (v: boolean) => void) => {
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  async function handleBuy() {
    if (!requireUser()) return;
    setError(null);
    try {
      await purchaseProject.mutateAsync(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed.");
    }
  }

  function handleJoinRoom() {
    if (hasAccess) router.push(`/rooms/${project.id}` as Href);
    else void handleBuy();
  }

  async function handleBookGig() {
    if (!requireUser()) return;
    setError(null);
    try {
      const { conversationId } = await bookGig.mutateAsync(project.id);
      router.push(`/messages/${conversationId}` as Href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed.");
    }
  }

  async function handleMessage(draftMessage?: string) {
    if (!requireUser()) return;
    setError(null);
    try {
      const conversationId = await startConversation.mutateAsync(project.owner_id);
      router.push((draftMessage ? { pathname: "/messages/[conversationId]", params: { conversationId, draftMessage } } : `/messages/${conversationId}`) as Href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start conversation.");
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
    setError(null);
    try {
      const url = await mutation.mutateAsync(args);
      await Linking.openURL(url);
      logFreeAccessIfNeeded("download");
    } catch (err) {
      setError(await resolveFunctionErrorMessage(err, fallback));
    }
  }

  async function loadStream(mutation: ReturnType<typeof useGetProjectFile>, kind: "audio" | "video" | "image", set: (url: string) => void, fallback: string) {
    if (!requireUser()) return;
    setError(null);
    try {
      const url = await mutation.mutateAsync({ projectId: project.id, kind });
      set(url);
      logFreeAccessIfNeeded("stream");
    } catch (err) {
      setError(await resolveFunctionErrorMessage(err, fallback));
    }
  }
  const handlePlayAudio = () => loadStream(getAudioStream, "audio", setAudioSrc, "Couldn't load audio.");
  const handlePlayVideo = () => loadStream(getVideoStream, "video", setVideoSrc, "Couldn't load video.");
  const handleViewImage = () => loadStream(getImageStream, "image", setImageSrc, "Couldn't load image.");

  async function copyText(text: string, onDone: () => void) {
    setError(null);
    try {
      await Clipboard.setStringAsync(text);
      onDone();
    } catch {
      setError("Couldn't copy link.");
    }
  }

  function openExternal(url: string | null | undefined, kind: "link_click" = "link_click") {
    if (!url) return;
    logFreeAccessIfNeeded(kind);
    void Linking.openURL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
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
      setError(err instanceof Error ? err.message : "Couldn't delete this project.");
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
      ? [{ key: "gift", label: "Gift", icon: mk(GiftIcon), count: null, onClick: () => setShowGiftPicker(true) } satisfies EngagementAction]
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

  const aspectRatio = project.thumbnail_width && project.thumbnail_height ? project.thumbnail_width / project.thumbnail_height : 16 / 9;
  const TypeIcon = TYPE_ICON[project.project_type];
  const primaryMediaKind: "audio" | "video" | null =
    isMedia && mediaDetails?.has_video && mediaDetails.video_file_path ? "video" : isMedia && mediaDetails?.has_audio && mediaDetails.audio_file_path ? "audio" : null;
  const showOwnerBadges = isOwner && (project.status !== "active" || project.is_private);
  const accessCount = accessCountQuery.data ?? 0;

  const ownerMenuItems: (DropdownMenuItem | "divider")[] = [
    { key: "edit", label: "Edit", icon: <Icon as={Pencil} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/projects/${project.id}/edit` as Href) },
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

  return (
    <View
      className="relative mb-4 overflow-hidden rounded-[28px] border border-border/60 bg-surface"
      style={{ shadowColor: `rgb(${colors.shadowInkRgb})`, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 3 }}
    >
      <View style={{ aspectRatio }} className="w-full items-center justify-center overflow-hidden bg-canvas">
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
          />
        ) : project.thumbnail_url ? (
          <Pressable
            onPress={() => !isDetailView && router.push(`/projects/${project.id}` as Href)}
            disabled={!!isDetailView}
            accessibilityRole={isDetailView ? "image" : "link"}
            className="h-full w-full"
          >
            <Image source={{ uri: project.thumbnail_url }} contentFit="cover" transition={150} style={{ width: "100%", height: "100%" }} />
          </Pressable>
        ) : (
          <Icon as={ImageIcon} size={32} className="text-ink-muted" />
        )}
      </View>

      {showOwnerBadges ? (
        <View className="absolute left-3 top-3 flex-row items-center gap-1.5">
          {project.status !== "active" ? (
            <View className="rounded-full bg-ink/85 px-2.5 py-1">
              <Text className="text-xs font-medium text-canvas">{project.status === "draft" ? "Draft" : project.status === "cancelled" ? "Cancelled" : "Archived"}</Text>
            </View>
          ) : null}
          {project.is_private ? (
            <View className="flex-row items-center gap-1 rounded-full bg-ink/70 px-2.5 py-1">
              <Icon as={EyeOff} size={10} className="text-canvas" />
              <Text className="text-xs font-medium text-canvas">Private</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {isOwner ? (
        <View className="absolute right-3 top-3">
          <View ref={menuButtonRef} collapsable={false}>
            <Pressable
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Project options"
              className="rounded-full bg-canvas/90 p-1.5"
              style={{ elevation: 3 }}
            >
              <Icon as={MoreHorizontal} size={16} className="text-ink-muted" />
            </Pressable>
          </View>
          {menuOpen ? <DropdownMenu anchorRef={menuButtonRef} onClose={() => setMenuOpen(false)} width={224} items={ownerMenuItems} /> : null}
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
                  <View className="h-1 w-1 rounded-full bg-ink-muted/50" />
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
            {project.description ? <Text className="mt-1 text-sm text-ink-muted">{renderFormattedText(project.description, "d")}</Text> : null}

            {/* Goal progress — informational only; hitting or missing the goal changes nothing about what's already pledged. */}
            {isPitch && pitchDetails ? (
              <View className="mt-2.5">
                <View className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                  <View className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, ((pitchRaised ?? 0) / pitchDetails.goal_amount_usd) * 100)}%` }} />
                </View>
                <Text className="mt-1 text-xs text-ink-muted">
                  ${(pitchRaised ?? 0).toFixed(0)} raised of ${pitchDetails.goal_amount_usd.toFixed(0)} goal
                </Text>
              </View>
            ) : null}

            {error ? <Text accessibilityRole="alert" className="mt-2 text-sm text-danger">{error}</Text> : null}

            {/* Media: the playable preview is the card's thumbnail; this holds the "full thing" links and the private image. */}
            {isMedia && mediaDetails ? (
              <View className="mt-3 gap-3">
                {mediaDetails.has_audio && mediaDetails.has_video
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
            {isBook && bookDetails && hasAccess ? (
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
                    label={isOwner && !project.published_at ? "Continue building" : "Read"}
                    onPress={() => router.push(`/books/${project.id}` as Href)}
                  />
                ) : null}
              </View>
            ) : null}
            {isBook && bookDetails && !hasAccess && !isOwner ? (
              <View className="mt-3">
                <LockedNote />
              </View>
            ) : null}

            <View className="mt-3 flex-row items-center gap-2">
              {project.project_type === "file" ? (
                hasAccess ? (
                  <LinkAction
                    icon={Download}
                    label={getFileDownload.isPending ? "Preparing…" : "Download"}
                    disabled={getFileDownload.isPending}
                    onPress={() => void openSigned(getFileDownload, { projectId: project.id, kind: "file" }, "Couldn't access file.")}
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

              {/* Gig: Message is always available (lead-gen first), plus an optional paid "Book" once a fee is set. */}
              {project.project_type === "gig" && !isOwner ? (
                <LinkAction icon={MessageCircle} label={startConversation.isPending ? "Opening…" : "Message"} disabled={startConversation.isPending} onPress={() => void handleMessage()} />
              ) : null}
              {project.project_type === "gig" && !isOwner && !isFree && hasPurchased ? <Text className="ml-2 text-sm text-ink-muted">Booked ✓</Text> : null}

              {isPitch && !isOwner ? (
                <Pressable
                  onPress={() => setSupportSheetOpen(true)}
                  accessibilityRole="button"
                  className="ml-auto flex-row items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 active:scale-[0.97]"
                  style={{ elevation: 3 }}
                >
                  <Icon as={Heart} size={15} className="text-canvas" />
                  <Text className="text-sm font-semibold text-canvas">Support</Text>
                </Pressable>
              ) : null}

              {!isRoom && !isPitch && !hasAccess && !isCourseUnpublished && !isBookDraftUnpublished ? (
                <Pressable
                  onPress={project.project_type === "gig" ? handleBookGig : handleBuy}
                  disabled={project.project_type === "gig" ? bookGig.isPending : purchaseProject.isPending}
                  accessibilityRole="button"
                  className={`ml-auto rounded-full bg-accent px-4 py-1.5 active:scale-[0.97] ${(project.project_type === "gig" ? bookGig.isPending : purchaseProject.isPending) ? "opacity-50" : ""}`}
                  style={{ elevation: 3 }}
                >
                  <Text className="text-sm font-semibold text-canvas">
                    {project.project_type === "gig"
                      ? bookGig.isPending ? "Booking…" : `Book for $${effectivePrice.toFixed(2)}`
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

            {/* ProjectDetail renders its own identical button right after the card, so skip it there. */}
            {canBecomeAffiliate && !isDetailView ? (
              <Pressable
                onPress={() => setAffiliateShareOpen(true)}
                accessibilityRole="button"
                className="mb-2 mt-3 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-accent-soft py-2.5 active:scale-[0.98]"
              >
                <Icon as={TrendingUp} size={15} className="text-accent" />
                <Text className="text-sm font-semibold text-accent">Share & earn a commission</Text>
              </Pressable>
            ) : null}

            <View className="mt-1 border-t border-border/60 pt-3">
              <ReactionTray
                leftActions={[]}
                middleActions={middleActions}
                rightActions={rightActions}
                onOpenMore={isArchivedFrozen || middleActions.length === 0 ? undefined : () => setShowMoreActions(true)}
                disabled={isArchivedFrozen}
              />
            </View>

            {showMoreActions && !isArchivedFrozen && middleActions.length > 0 ? <ReactionMoreSheet actions={middleActions} onClose={() => setShowMoreActions(false)} /> : null}

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
    </View>
  );
}

export const ProjectCard = memo(ProjectCardImpl);
