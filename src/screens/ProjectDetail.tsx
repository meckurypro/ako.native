// src/screens/ProjectDetail.tsx
// One project: the card (with everything its type can do), type-specific
// browsing info (event date/location/countdown, meeting time, gig details &
// samples & reviews), FAQ, topics, the creator byline, and "more like this".
import {
  ArrowLeft,
  Briefcase,
  CalendarClock,
  CalendarPlus,
  Clock,
  MapPin,
  Navigation,
  RefreshCw,
  TrendingUp,
  Video,
} from "lucide-react-native";
import { router, useLocalSearchParams, usePathname, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { AffiliateShareSheet } from "@/components/project/AffiliateShareSheet";
import { EventHighlightsSection } from "@/components/project/EventHighlightsSection";
import { ForewordInviteModal } from "@/components/project/ForewordInviteModal";
import { ForewordsSheet } from "@/components/project/ForewordsSheet";
import { BookReviewsSection } from "@/components/project/book/BookReviewsSection";
import { GigFaqSection, GigReviewsSection } from "@/components/project/GigSections";
import { ProjectCard } from "@/components/project/ProjectCard";
import { PublishMusicButton } from "@/components/music/PublishMusicButton";
import { ProjectFaqSection } from "@/components/project/ProjectFaqSection";
import { ProjectRail } from "@/components/project/ProjectRail";
import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { RoleTags } from "@/components/ui/RoleTags";
import { Text } from "@/components/ui/Text";
import { TierBadge } from "@/components/ui/TierBadge";
import { Wordmark } from "@/components/ui/Wordmark";
import { useAffiliateProgram } from "@/hooks/useAffiliates";
import { useAuth } from "@/hooks/useAuth";
import { isForewordSupportedType, isInviteOpen, useMyForeword, useProjectForewords } from "@/hooks/useForewords";
import { usePrefetchBookChapters } from "@/hooks/useBookBuilder";
import { useProjectOwnership } from "@/hooks/useProjectOwnership";
import { useRecordFreeProjectOpen } from "@/hooks/useProjectAccess";
import { formatCountdown, useCountdown } from "@/hooks/useCountdown";
import { useMarkProjectSeen } from "@/hooks/useMarkProjectSeen";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useEventDetails, useGigDetails, useGigSamples, useGigsFeaturingProject, useMeetingDetails } from "@/hooks/useProjectTypeDetails";
import { useProjectDetail, useSimilarProjects } from "@/hooks/useProjects";
import { safeReturnPath } from "@/lib/authRedirect";
import { OfflineUnavailable } from "@/components/project/OfflineUnavailable";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useSeedOfflineProject } from "@/hooks/useSeedOfflineProject";
import { addToCalendar } from "@/lib/calendar";
import { pageModeLabel } from "@/lib/pageRoles";
import { getProjectUrl } from "@/lib/projectLinks";
import { openExternal } from "@/lib/openExternal";

export function ProjectDetail({ resolvedProjectId }: { resolvedProjectId?: string } = {}) {
  const params = useLocalSearchParams<{ projectId?: string; forewords?: string }>();
  const projectId = resolvedProjectId ?? params.projectId;
  const smartBack = useSmartBack();
  const insets = useSafeAreaInsets();
  const navInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  // Signed-out visitors (a shared link opened in the app) get the page as a landing: the project itself, but no way
  // to wander off into the rest of the app. Everything that would (creator profile, other projects, back-nav) is
  // hidden, and every action goes through login first. Mirrors the web app.
  const isGuest = !authLoading && !user;
  // There is no bottom nav in the guest shell, so don't reserve room for it.
  const bottomInset = isGuest ? insets.bottom + 16 : navInset;

  const { data: project, isLoading, refetch: refetchProject } = useProjectDetail(projectId);
  const online = useIsOnline();
  useSeedOfflineProject(projectId);
  // Warm the book's text while this page is open so "Read" opens without a wait (skipped offline: the saved copy is seeded instead).
  usePrefetchBookChapters(project?.id, online && !!user && project?.project_type === "book");
  const { data: similar, refetch: refetchSimilar } = useSimilarProjects(user ? project : undefined);
  const { data: eventDetails, refetch: refetchEvent } = useEventDetails(project?.project_type === "event" ? projectId : undefined);
  const { data: meetingDetails, refetch: refetchMeeting } = useMeetingDetails(project?.project_type === "meeting" ? projectId : undefined);
  const { data: gigDetails, refetch: refetchGig } = useGigDetails(project?.project_type === "gig" ? projectId : undefined);
  const { data: gigSamples, refetch: refetchGigSamples } = useGigSamples(project?.project_type === "gig" ? projectId : undefined);
  const { data: featuringGigs, refetch: refetchFeaturingGigs } = useGigsFeaturingProject(project && project.project_type !== "gig" ? projectId : undefined);
  const ownership = useProjectOwnership();
  const isOwner = ownership.isOwner(project);
  const isCreator = !!user && !!project && project.owner.id === user.id;
  useRecordFreeProjectOpen(project, { isOwner: isCreator });
  const eventCountdownMs = useCountdown(project?.project_type === "event" ? eventDetails?.event_date : undefined);

  const { data: affiliateProgram, refetch: refetchAffiliate } = useAffiliateProgram(project && project.project_type !== "pitch" ? project.id : undefined);

  // refetch() ignores `enabled`, so only refetch the queries this project type actually loads.
  const type = project?.project_type;
  const { refreshControl, refreshing } = usePullToRefresh(
    !project
      ? [refetchProject]
      : [
          refetchProject,
          ...(isGuest ? [] : [refetchSimilar]),
          ...(type === "event" ? [refetchEvent] : []),
          ...(type === "meeting" ? [refetchMeeting] : []),
          ...(type === "gig" ? [refetchGig, refetchGigSamples] : [refetchFeaturingGigs]),
          ...(type !== "pitch" ? [refetchAffiliate] : []),
        ],
    insets.top + 16
  );
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  // Forewords: the creator's panel (also opened by ?forewords=1 from a notification) and the invitee's dialog.
  const [forewordsOpen, setForewordsOpen] = useState(params.forewords === "1");
  const [forewordModalOpen, setForewordModalOpen] = useState(false);
  const forewordsEnabled = !!project && isForewordSupportedType(project.project_type);
  const canManageForewords = forewordsEnabled && isCreator;
  const forewordsList = useProjectForewords(project?.id, canManageForewords);
  const forewordsToReview = (forewordsList.data ?? []).filter((f) => f.status === "submitted").length;
  const myForewordRow = useMyForeword(forewordsEnabled && !isCreator ? project?.id : undefined).data;
  const showForewordInvitee = !!myForewordRow && (isInviteOpen(myForewordRow) || myForewordRow.status === "submitted" || myForewordRow.status === "approved");
  const canBecomeAffiliate = !!user && !!project && !isOwner && !!affiliateProgram?.enabled && project.price_usd > 0;
  const shareUrl = project ? getProjectUrl(project) : undefined;

  useMarkProjectSeen(projectId!, project?.owner?.id);

  // Back to THIS page after login/sign-up (the pretty /:slug address when that's how they arrived). replace, not push:
  // the guest page must not stay mounted underneath once they're signed in.
  const returnTo = safeReturnPath(pathname) ?? (projectId ? `/projects/${projectId}` : null);
  const goAuth = (screen: "login" | "signup") => router.replace((returnTo ? `/${screen}?redirect=${encodeURIComponent(returnTo)}` : `/${screen}`) as Href);

  // Browsing info below the title. Everyone — guests and signed-in members alike — gets it folded into the card
  // behind a "Details" toggle that starts closed, so the page opens on the title, cover and actions.
  const detailBlocks = project ? (
    <>
      {/* Event/meeting browsing info — shown to everyone; purchase is what unlocks the ticket/join page. */}
      {project.project_type === "event" && eventDetails ? (
        <View className={`mb-4 gap-2`}>
          <View className="gap-1.5">
            {eventDetails.event_date ? (
              <View className="flex-row items-center gap-1.5">
                <Icon as={CalendarClock} size={14} className="text-ink-muted" />
                <Text className="text-sm text-ink-muted">{new Date(eventDetails.event_date).toLocaleString()}</Text>
              </View>
            ) : null}
            <View className="flex-row items-center gap-1.5">
              <Icon as={MapPin} size={14} className="text-ink-muted" />
              <Text className="flex-1 text-sm text-ink-muted">{eventDetails.location_type === "physical" ? eventDetails.location_value : "Online"}</Text>
            </View>
          </View>

          {eventDetails.event_date && eventCountdownMs !== null && eventCountdownMs > 0 ? (
            <Text className="text-sm font-medium text-accent">Starts in {formatCountdown(eventCountdownMs)}</Text>
          ) : null}

          <View className="flex-row items-center gap-4">
            {eventDetails.event_date ? (
              <Pressable
                onPress={() =>
                  void addToCalendar({
                    title: project.title,
                    description: project.description ?? undefined,
                    location: eventDetails.location_value || undefined,
                    startIso: eventDetails.event_date!,
                  })
                }
                accessibilityRole="button"
                className="flex-row items-center gap-1.5"
              >
                <Icon as={CalendarPlus} size={15} className="text-accent" />
                <Text className="text-sm font-medium text-accent">Add to calendar</Text>
              </Pressable>
            ) : null}
            {eventDetails.location_type === "physical" && eventDetails.location_value ? (
              <Pressable
                onPress={() => void openExternal(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventDetails.location_value!)}`)}
                accessibilityRole="link"
                className="flex-row items-center gap-1.5"
              >
                <Icon as={Navigation} size={15} className="text-accent" />
                <Text className="text-sm font-medium text-accent">Directions</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {project.project_type === "meeting" && meetingDetails ? (
        <View className={`mb-4 flex-row items-center gap-1.5`}>
          <Icon as={Video} size={14} className="text-ink-muted" />
          <Text className="text-sm text-ink-muted">{new Date(meetingDetails.scheduled_at).toLocaleString()}</Text>
        </View>
      ) : null}

      {/* Gig browsing info — tagline/delivery up top, proof-of-work samples below. Message/Book live on the card. */}
      {project.project_type === "gig" && gigDetails?.tagline ? <Text className={`mb-2 text-sm font-medium text-ink`}>{gigDetails.tagline}</Text> : null}
      {project.project_type === "gig" && gigDetails?.delivery_estimate ? (
        <View className="mb-1.5 flex-row flex-wrap items-center gap-1.5">
          <Icon as={Clock} size={14} className="text-ink-muted" />
          <Text className="text-sm text-ink-muted">{gigDetails.delivery_estimate}</Text>
          {gigDetails.revisions_included !== null && gigDetails.revisions_included !== undefined ? (
            <View className="flex-row items-center gap-1">
              <Text className="text-sm text-ink-muted">·</Text>
              <Icon as={RefreshCw} size={12} className="text-ink-muted" />
              <Text className="text-sm text-ink-muted">
                {gigDetails.revisions_included} revision{gigDetails.revisions_included === 1 ? "" : "s"}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {project.project_type === "gig" && !gigDetails?.delivery_estimate && gigDetails?.revisions_included !== null && gigDetails?.revisions_included !== undefined ? (
        <View className="mb-1.5 flex-row items-center gap-1.5">
          <Icon as={RefreshCw} size={12} className="text-ink-muted" />
          <Text className="text-sm text-ink-muted">
            {gigDetails.revisions_included} revision{gigDetails.revisions_included === 1 ? "" : "s"}
          </Text>
        </View>
      ) : null}
      {project.project_type === "gig" && gigDetails?.deliverables && gigDetails.deliverables.length > 0 ? (
        <View className="mb-4 gap-1">
          {gigDetails.deliverables.map((item, i) => (
            <View key={i} className="flex-row items-start gap-1.5">
              <Text className="mt-0.5 text-sm text-accent">✓</Text>
              <Text className="flex-1 text-sm text-ink-muted">{item}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {project.project_type === "gig" && gigSamples && gigSamples.length > 0 ? <ProjectRail title="Work samples" projects={gigSamples} /> : null}
      {project.project_type === "gig" && gigDetails?.faq && gigDetails.faq.length > 0 ? <GigFaqSection faq={gigDetails.faq} /> : null}
      {project.project_type === "gig" ? <GigReviewsSection projectId={project.id} /> : null}
      {/* Book reviews: signed-in users only (RLS enforces it too); reviewing happens in the reader. */}
      {project.project_type === "book" && !isGuest ? <BookReviewsSection projectId={project.id} /> : null}

      {project.project_type === "event" ? <EventHighlightsSection projectId={project.id} isOwner={isOwner} /> : null}

      <ProjectFaqSection projectId={project.id} projectType={project.project_type} isOwner={isOwner} />


      {project.topics.length > 0 ? (
        <View className="mb-4 mt-4 flex-row flex-wrap gap-2">
          {project.topics.map((topic) => (
            <View key={topic.id} className="rounded-full border border-border-a60 bg-surface px-3 py-1">
              <Text className="text-xs font-medium text-ink-muted">{topic.name}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </>
  ) : null;

  return (
    <KeyboardAvoider className="flex-1 bg-canvas">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        ref={onScroll.listRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: bottomInset + 16, opacity: refreshing ? 0 : 1 }}
      >
        <View className="w-full max-w-2xl self-center">
          {isGuest ? (
            <View className="mb-4 flex-row items-center justify-between">
              <Wordmark size="sm" />
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => goAuth("login")}
                  accessibilityRole="button"
                  className="rounded-full border border-border-a60 bg-surface px-4 py-2 active:opacity-90"
                  style={{ elevation: 2 }}
                >
                  <Text className="text-sm font-medium text-ink">Log in</Text>
                </Pressable>
                <Pressable onPress={() => goAuth("signup")} accessibilityRole="button" className="rounded-full bg-accent px-4 py-2 active:opacity-90" style={{ elevation: 2 }}>
                  <Text className="text-sm font-semibold text-canvas">Sign up</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {user ? (
            <Pressable
              onPress={smartBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="mb-4 h-10 w-10 items-center justify-center self-start rounded-full border border-border-a60 bg-surface"
              style={{ elevation: 2 }}
            >
              <Icon as={ArrowLeft} size={20} className="text-ink-muted" />
            </Pressable>
          ) : null}

          {authLoading || isLoading || !project ? (
            // Offline with nothing to show: say so (and offer the saved copy / Library) rather than spin forever.
            !authLoading && !project && !online ? <OfflineUnavailable projectId={projectId} inline /> : <Text className="text-ink-muted">Loading…</Text>
          ) : (
            <>
              <ProjectCard project={project} isDetailView shareUrl={shareUrl} concealDetails detailsSlot={detailBlocks} />

              {/* Reverse link to the gig(s) this is proof-of-work for — otherwise a visitor landing here
                  directly (a feed post, a share) has no way to discover the gig itself. */}
              {!isGuest && featuringGigs && featuringGigs.length > 0 ? (
                <View className="-mt-2 mb-4 flex-row flex-wrap gap-2">
                  {featuringGigs.map((gig) => (
                    <Pressable
                      key={gig.id}
                      onPress={() => router.push(`/projects/${gig.id}` as Href)}
                      accessibilityRole="link"
                      className="flex-row items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 active:scale-[0.98]"
                    >
                      <Icon as={Briefcase} size={14} className="text-accent" />
                      <Text className="text-sm font-medium text-accent">{gig.role_label ? `Featured in ${gig.role_label} gig` : "View the gig this is part of"}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {canBecomeAffiliate ? (
                <Pressable
                  onPress={() => setShareSheetOpen(true)}
                  accessibilityRole="button"
                  className="-mt-2 mb-4 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-accent-soft py-3 active:scale-[0.98]"
                >
                  <Icon as={TrendingUp} size={16} className="text-accent" />
                  <Text className="text-sm font-semibold text-accent">Share & earn a commission</Text>
                </Pressable>
              ) : null}

              {/* The owner's publish action is a main action, not browsing info: it stays out of the folded details. */}
              {project.project_type === "media" && isOwner ? <PublishMusicButton projectId={project.id} /> : null}

              {canManageForewords ? (
                <Pressable onPress={() => setForewordsOpen(true)} accessibilityRole="button" className="mb-4 w-full flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3">
                  <Text className="text-sm font-semibold text-ink">Forewords</Text>
                  {forewordsToReview > 0 ? (
                    <View className="h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5">
                      <Text className="text-[11px] text-canvas">{forewordsToReview}</Text>
                    </View>
                  ) : null}
                </Pressable>
              ) : null}
              {showForewordInvitee && myForewordRow ? (
                <Pressable onPress={() => setForewordModalOpen(true)} accessibilityRole="button" className="mb-4 w-full rounded-2xl bg-accent-soft px-4 py-3">
                  <Text className="text-sm font-medium text-accent">
                    {isInviteOpen(myForewordRow)
                      ? "You've been asked to write a foreword — tap to respond"
                      : myForewordRow.status === "submitted"
                        ? "Your foreword is awaiting the creator's review"
                        : "Your foreword is published — tap to edit"}
                  </Text>
                </Pressable>
              ) : null}

              {/* Creator byline — opens the creator's profile (or the Page's, if this was posted in page mode).
                  A page-posted project shows the brand/org here; owner_id underneath is still the creating user. */}
              {!isGuest ? (
                <Pressable
                  onPress={() => router.push((project.posted_as_page ? `/page/${project.posted_as_page.username}` : `/profile/${project.owner.username}`) as Href)}
                  accessibilityRole="link"
                  className="flex-row items-center gap-3 rounded-2xl border border-border-a60 bg-surface p-4 active:opacity-90"
                  style={{ elevation: 2 }}
                >
                  {project.posted_as_page ? (
                    <>
                      <Avatar src={project.posted_as_page.avatar_url} name={project.posted_as_page.name} size="lg" />
                      <View className="min-w-0 flex-1">
                        <Text className="font-medium text-ink">{project.posted_as_page.name}</Text>
                        <Text className="mt-0.5 text-xs text-ink-muted">{pageModeLabel(project.posted_as_page.page_type)}</Text>
                        <Text className="text-sm text-ink-muted">@{project.posted_as_page.username}</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Avatar src={project.owner.avatar_url} name={project.owner.display_name} size="lg" />
                      <View className="min-w-0 flex-1">
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Text className="font-medium text-ink">{project.owner.display_name}</Text>
                          <TierBadge tier={project.owner.tier} />
                        </View>
                        {project.owner.roles.length > 0 ? <RoleTags roles={project.owner.roles} className="mt-0.5 text-xs text-ink-muted" /> : null}
                        <Text className="text-sm text-ink-muted">@{project.owner.username}</Text>
                      </View>
                    </>
                  )}
                </Pressable>
              ) : null}

              {/* "More from <you>" is for visitors — the creator already has all of this on their own profile. */}
              {!isGuest && !isOwner ? <ProjectRail title={`More from ${project.posted_as_page ? project.posted_as_page.name : project.owner.display_name}`} projects={similar?.moreFromCreator ?? []} /> : null}
              {!isGuest ? <ProjectRail title="Similar contents" projects={similar?.similarContent ?? []} /> : null}
            </>
          )}
        </View>
      </ScrollView>

      {forewordsOpen && project && canManageForewords && (project.project_type === "book" || project.project_type === "course") ? (
        <ForewordsSheet
          projectId={project.id}
          projectType={project.project_type}
          onClose={() => {
            setForewordsOpen(false);
            if (params.forewords) router.setParams({ forewords: undefined });
          }}
        />
      ) : null}
      {forewordModalOpen && project ? <ForewordInviteModal projectId={project.id} onClose={() => setForewordModalOpen(false)} /> : null}

      {shareSheetOpen && project ? (
        <AffiliateShareSheet projectId={project.id} projectTitle={project.title} shareUrl={shareUrl} onClose={() => setShareSheetOpen(false)} />
      ) : null}
    </KeyboardAvoider>
  );
}
