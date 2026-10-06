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
import * as Linking from "expo-linking";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { AffiliateShareSheet } from "@/components/project/AffiliateShareSheet";
import { EventHighlightsSection } from "@/components/project/EventHighlightsSection";
import { GigFaqSection, GigReviewsSection } from "@/components/project/GigSections";
import { ProjectCard } from "@/components/project/ProjectCard";
import { ProjectFaqSection } from "@/components/project/ProjectFaqSection";
import { ProjectRail } from "@/components/project/ProjectRail";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { RoleTags } from "@/components/ui/RoleTags";
import { Text } from "@/components/ui/Text";
import { TierBadge } from "@/components/ui/TierBadge";
import { useAffiliateProgram } from "@/hooks/useAffiliates";
import { useAuth } from "@/hooks/useAuth";
import { formatCountdown, useCountdown } from "@/hooks/useCountdown";
import { useMarkProjectSeen } from "@/hooks/useMarkProjectSeen";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useEventDetails, useGigDetails, useGigSamples, useGigsFeaturingProject, useMeetingDetails } from "@/hooks/useProjectTypeDetails";
import { PROJECT_TYPE_LABELS, useProjectDetail, useSimilarProjects } from "@/hooks/useProjects";
import { shareIcsEvent } from "@/lib/calendar";
import { pageModeLabel } from "@/lib/pageRoles";
import { getProjectUrl } from "@/lib/projectLinks";

export function ProjectDetail({ resolvedProjectId }: { resolvedProjectId?: string } = {}) {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const projectId = resolvedProjectId ?? params.projectId;
  const smartBack = useSmartBack();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { user } = useAuth();

  const { data: project, isLoading } = useProjectDetail(projectId);
  const { data: similar } = useSimilarProjects(project);
  const { data: eventDetails } = useEventDetails(project?.project_type === "event" ? projectId : undefined);
  const { data: meetingDetails } = useMeetingDetails(project?.project_type === "meeting" ? projectId : undefined);
  const { data: gigDetails } = useGigDetails(project?.project_type === "gig" ? projectId : undefined);
  const { data: gigSamples } = useGigSamples(project?.project_type === "gig" ? projectId : undefined);
  const { data: featuringGigs } = useGigsFeaturingProject(project && project.project_type !== "gig" ? projectId : undefined);
  const isOwner = !!user && !!project && project.owner.id === user.id;
  const eventCountdownMs = useCountdown(project?.project_type === "event" ? eventDetails?.event_date : undefined);

  const { data: affiliateProgram } = useAffiliateProgram(project && project.project_type !== "pitch" ? project.id : undefined);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const canBecomeAffiliate = !!user && !!project && !isOwner && !!affiliateProgram?.enabled && project.price_usd > 0;
  const shareUrl = project ? getProjectUrl(project) : undefined;

  useMarkProjectSeen(projectId!, project?.owner?.id);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: bottomInset + 16 }}
      >
        <View className="w-full max-w-2xl self-center">
          <Pressable
            onPress={smartBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="mb-4 h-10 w-10 items-center justify-center self-start rounded-full border border-border/60 bg-surface"
            style={{ elevation: 2 }}
          >
            <Icon as={ArrowLeft} size={20} className="text-ink-muted" />
          </Pressable>

          {isLoading || !project ? (
            <Text className="text-ink-muted">Loading…</Text>
          ) : (
            <>
              <ProjectCard project={project} isDetailView shareUrl={shareUrl} />

              {/* Reverse link to the gig(s) this is proof-of-work for — otherwise a visitor landing here
                  directly (a feed post, a share) has no way to discover the gig itself. */}
              {featuringGigs && featuringGigs.length > 0 ? (
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

              {/* Event/meeting browsing info — shown to everyone; purchase is what unlocks the ticket/join page. */}
              {project.project_type === "event" && eventDetails ? (
                <View className="-mt-2 mb-4 gap-2">
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
                          void shareIcsEvent({
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
                        onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventDetails.location_value!)}`)}
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
                <View className="-mt-2 mb-4 flex-row items-center gap-1.5">
                  <Icon as={Video} size={14} className="text-ink-muted" />
                  <Text className="text-sm text-ink-muted">{new Date(meetingDetails.scheduled_at).toLocaleString()}</Text>
                </View>
              ) : null}

              {/* Gig browsing info — tagline/delivery up top, proof-of-work samples below. Message/Book live on the card. */}
              {project.project_type === "gig" && gigDetails?.tagline ? <Text className="-mt-2 mb-2 text-sm font-medium text-ink">{gigDetails.tagline}</Text> : null}
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

              {project.project_type === "event" ? <EventHighlightsSection projectId={project.id} isOwner={isOwner} /> : null}

              <ProjectFaqSection projectId={project.id} projectType={project.project_type} isOwner={isOwner} />

              {project.topics.length > 0 ? (
                <View className="mb-4 mt-4 flex-row flex-wrap gap-2">
                  {project.topics.map((topic) => (
                    <View key={topic.id} className="rounded-full border border-border/60 bg-surface px-3 py-1">
                      <Text className="text-xs font-medium text-ink-muted">{topic.name}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Creator byline — opens the creator's profile (or the Page's, if this was posted in page mode).
                  A page-posted project shows the brand/org here; owner_id underneath is still the creating user. */}
              <Pressable
                onPress={() => router.push((project.posted_as_page ? `/page/${project.posted_as_page.username}` : `/profile/${project.owner.username}`) as Href)}
                accessibilityRole="link"
                className="flex-row items-center gap-3 rounded-2xl border border-border/60 bg-surface p-4 active:opacity-90"
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

              <ProjectRail title={`More from ${project.posted_as_page ? project.posted_as_page.name : project.owner.display_name}`} projects={similar?.moreFromCreator ?? []} />
              <ProjectRail title="Similar topics" projects={similar?.moreOnTopic ?? []} />
              <ProjectRail title={`More ${PROJECT_TYPE_LABELS[project.project_type]}s`} projects={similar?.moreOfType ?? []} />
            </>
          )}
        </View>
      </ScrollView>

      {shareSheetOpen && project ? (
        <AffiliateShareSheet projectId={project.id} projectTitle={project.title} shareUrl={shareUrl} onClose={() => setShareSheetOpen(false)} />
      ) : null}
    </View>
  );
}
