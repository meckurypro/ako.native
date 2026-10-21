// src/screens/ProfilePage.tsx
// A person's profile: toolbar · identity block · stats · sticky tab bar · the
// active tab's content (Posts for full-access accounts, portfolio categories, Media, Projects…).
//
// Native structure: ONE vertical list. The header and the tab bar are the first
// two rows (the tab bar is a sticky header, so it pins under the status bar
// when the identity block scrolls away), and the rows after them are the active
// tab's items — so the whole page scrolls as a single virtualized surface.
// Swiping sideways switches tab (SwipeToSwitch).
//
import {
  Activity as ActivityIcon,
  Ban,
  Bell,
  BellOff,
  Briefcase,
  Building2,
  ChevronDown,
  Clock,
  Eye,
  LayoutGrid,
  Layers,
  Link2,
  Lock,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Undo2,
  UserCheck,
  UserMinus,
  UserPlus,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FAB_GAP, FAB_SIZE, useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { PostCard } from "@/components/post/PostCard";
import { ProjectMiniCard, ProjectMiniGrid } from "@/components/post/ProjectMiniCard";
import { ProjectCardList } from "@/components/project/ProjectCardList";
import { AccountSwitcher } from "@/components/account/AccountSwitcher";
import { ProfileAdSlot } from "@/components/profile/ProfileAdSlot";
import { ProfilePagesModal } from "@/components/profile/ProfilePagesModal";
import { ProfileShareScreen } from "@/components/profile/ProfileShareScreen";
import { ReportModal } from "@/components/profile/ReportModal";
import { ShareProfileSheet } from "@/components/profile/ShareProfileSheet";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { Icon } from "@/components/ui/styled";
import { RoleTags } from "@/components/ui/RoleTags";
import { SwipeToSwitch } from "@/components/ui/SwipeToSwitch";
import { Text } from "@/components/ui/Text";
import { TierBadge } from "@/components/ui/TierBadge";
import { useToast } from "@/components/ui/Toast";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { BadgeStreakNote } from "@/components/ui/BadgeStreakNote";
import { MediaViewer } from "@/components/post/MediaViewer";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { useAuth } from "@/hooks/useAuth";
import { useProjectOwnership } from "@/hooks/useProjectOwnership";
import { useContactNickname } from "@/hooks/useContactNicknames";
import { useCancelFollowRequest, useHasPendingFollowRequest, useIncomingFollowRequestCount, useSendFollowRequest } from "@/hooks/useFollowRequests";
import { useStartConversation } from "@/hooks/useMessaging";
import { useProfilePages } from "@/hooks/usePages";
import {
  useCategorizedProjectIds,
  useCollaboratorMediaProjects,
  usePortfolioCategories,
  usePortfolioCategoryGigs,
  usePortfolioCategoryProjects,
  useTypeCategoryProjects,
  useTypePortfolioCategories,
} from "@/hooks/usePortfolio";
import { useUserPostsWithArchived } from "@/hooks/usePosts";
import { OfflineUnavailable } from "@/components/project/OfflineUnavailable";
import { useIsOnline } from "@/hooks/useIsOnline";
import { RefreshSkeleton } from "@/components/ui/RefreshSkeleton";
import { PostListSkeleton, ProfilePageSkeleton, ProjectGridSkeleton } from "@/components/ui/ProfileSkeletons";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useIsBlocked, useIsMuted, useRemoveFollower, useToggleBlock, useToggleMute } from "@/hooks/usePrivacy";
import { useIsFollowedByUser, useIsFollowingAsActiveIdentity, useProfileByUsername, useToggleFollowAsActiveIdentity } from "@/hooks/useProfile";
import { useRecordProfileVisit } from "@/hooks/useProfileVisits";
import { useUserProjects, type Project, type ProjectType } from "@/hooks/useProjects";
import { useTabState } from "@/hooks/useTabState";
import { APP_URL } from "@/lib/config";
import { haptics } from "@/lib/haptics";
import { openExternal } from "@/lib/openExternal";
import { profileTabIcon } from "@/lib/profileTabIcons";
import { useTheme } from "@/theme/ThemeProvider";

// Tabs are icon-only now, so a lot more of them fit in equal-width cells than text labels did.
const MAX_EQUAL_TABS = 9;
const TYPE_CATEGORY_TYPES = new Set<ProjectType>(["book", "course", "event", "room", "file"]);

function getWebsiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function getWebsiteDomain(url: string): string {
  try {
    return new URL(getWebsiteHref(url)).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0];
  }
}

function categoryToTabId(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

type Row =
  | { kind: "header" }
  | { kind: "tabs" }
  | { kind: "post"; id: string; post: any }
  | { kind: "grid"; id: string; projects: Project[] }
  | { kind: "minigrid"; id: string; projects: Project[] }
  | { kind: "skeleton"; id: string; projectType?: ProjectType }
  | { kind: "postskeleton"; id: string }
  | { kind: "gigs"; id: string; gigs: Project[] }
  | { kind: "message"; id: string; text: string; icon?: LucideIcon };

// Icon-led empty / blocked / error state, same shape as the private-account notice.
function Message({ text, icon = Layers }: { text: string; icon?: LucideIcon }) {
  return (
    <View className="items-center px-6 py-14">
      <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
        <Icon as={icon} size={22} className="text-accent" />
      </View>
      <Text className="max-w-xs text-center text-sm text-ink-muted">{text}</Text>
    </View>
  );
}

export function ProfilePage() {
  const { username, fromPost } = useLocalSearchParams<{ username: string; fromPost?: string }>();
  const { user } = useAuth();
  const restricted = useIsRestricted();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const toast = useToast();
  const startConversation = useStartConversation();
  const listRef = useRef<FlashListRef<Row>>(null);
  // "Back to post" only when this page was reached from a feed post's byline.
  const [fromFeedPostId] = useState<string | null>(() => fromPost ?? null);
  // Shares listRef with the app-wide scroll-to-top arrow (see ChromeProvider / ScrollToTopButton). Arrived from a
  // post, "Back to post" is the one floating action: the arrow would sit next to it, covering content.
  const chromeScroll = useChromeScroll(listRef, 6, !fromFeedPostId);

  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const ownerMenuButtonRef = useRef<View>(null);
  const [relationshipMenuOpen, setRelationshipMenuOpen] = useState(false);
  const relationshipMenuButtonRef = useRef<View>(null);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
  const [showRemoveFollowerConfirm, setShowRemoveFollowerConfirm] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [previewingAsVisitor, setPreviewingAsVisitor] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [reportContentOpen, setReportContentOpen] = useState(false);
  const [qrShareOpen, setQrShareOpen] = useState(false);

  useEffect(() => {
    if (fromPost) router.setParams({ fromPost: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: profile, isLoading, refetch: refetchProfile } = useProfileByUsername(username ?? "");
  const online = useIsOnline();

  const isFollowingQuery = useIsFollowingAsActiveIdentity(profile?.id ?? "");
  const isFollowedByUserQuery = useIsFollowedByUser(profile?.id ?? "");
  const toggleFollow = useToggleFollowAsActiveIdentity(profile?.id ?? "");
  const hasPendingRequestQuery = useHasPendingFollowRequest(profile?.id ?? "");
  const sendFollowRequest = useSendFollowRequest(profile?.id ?? "");
  const cancelFollowRequest = useCancelFollowRequest(profile?.id ?? "");
  const incomingRequestCount = useIncomingFollowRequestCount();
  const isBlockedQuery = useIsBlocked(profile?.id ?? "");
  const toggleBlock = useToggleBlock(profile?.id ?? "");
  const isMutedQuery = useIsMuted(profile?.id ?? "");
  const toggleMute = useToggleMute(profile?.id ?? "");
  const removeFollower = useRemoveFollower(profile?.id ?? "");
  const { data: nickname } = useContactNickname(profile?.id ?? "");

  const isOwnProfile = user?.id === profile?.id;
  const profilePagesQuery = useProfilePages(profile?.id ?? "");
  const [pagesOpen, setPagesOpen] = useState(false);
  const showOwnerView = isOwnProfile && !previewingAsVisitor;
  // Up to 3 websites; website_url mirrors the first for rows written before website_urls existed.
  const websites = profile?.website_urls?.length ? profile.website_urls : profile?.website_url ? [profile.website_url] : [];
  // Projects on this profile are the PERSON's. While acting as a Page, the
  // Page is a different account, so they read as another user's content: no
  // owner controls and no drafts/archived — same as any visitor.
  const { actingAsPageId, loading: identityLoading } = useProjectOwnership();
  const projectsOwnerView = showOwnerView && !identityLoading && !actingAsPageId;
  const isFollowing = !!isFollowingQuery.data;
  const isFollowedByUser = !!isFollowedByUserQuery.data;
  const hasPendingRequest = !!hasPendingRequestQuery.data;
  const isBlocked = !!isBlockedQuery.data;
  const isMuted = !!isMutedQuery.data;
  const displayName = nickname || profile?.display_name || "";
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? "";
  const isPrivateLocked = !!profile?.is_private && !showOwnerView && !isFollowing;
  // Pages icon: orange + tappable only when there is something to show; hidden behind a private lock.
  const hasPages = !isPrivateLocked && (profilePagesQuery.data?.length ?? 0) > 0;
  // The owner can always open the modal: with pages it lists them (tap to switch into one), without any it
  // explains pages and offers to set one up. A visitor only gets it when there's something to see.
  const pagesIconEnabled = showOwnerView || hasPages;

  const accountId = isPrivateLocked ? undefined : profile?.id;
  const { data: projects, isLoading: projectsLoading, refetch: refetchProjects } = useUserProjects(isPrivateLocked ? "" : profile?.id ?? "", projectsOwnerView);
  const { data: posts, isLoading: postsLoading, isError: postsError, refetch: refetchPosts } = useUserPostsWithArchived(isPrivateLocked || restricted ? "" : profile?.id ?? "", false);
  const { data: portfolioCategories, isLoading: portfolioLoading, refetch: refetchPortfolio } = usePortfolioCategories(accountId);
  const { data: categorizedProjectIds, refetch: refetchCategorizedIds } = useCategorizedProjectIds(accountId);
  const { data: typeCategories, isLoading: typeCategoriesLoading, refetch: refetchTypeCategories } = useTypePortfolioCategories(accountId);
  const { data: collaboratorMedia, refetch: refetchCollaboratorMedia } = useCollaboratorMediaProjects(accountId);

  // True until the queries that decide which tabs exist (and what the Projects tab holds) have answered — an
  // empty-state message before then would claim "nothing here" about data that simply hasn't arrived.
  const tabsLoading = projectsLoading || portfolioLoading || typeCategoriesLoading;

  const visibleProjects = projects?.filter((p) => p.status !== "archived");

  const mediaProjects = useMemo(() => {
    const owned = (visibleProjects ?? []).filter((p) => p.project_type === "media" && !p.is_private && !categorizedProjectIds?.has(p.id));
    const byId = new Map(owned.map((p) => [p.id, p]));
    for (const p of collaboratorMedia ?? []) if (!categorizedProjectIds?.has(p.id)) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [visibleProjects, collaboratorMedia, categorizedProjectIds]);

  const typeCategoriesPresent = new Set((typeCategories ?? []).map((c) => c.project_type));
  const fallbackProjects = visibleProjects?.filter((p) => {
    if (p.project_type === "gig") return false;
    if (p.project_type === "media" && p.status === "active" && !p.is_private) return false;
    if (categorizedProjectIds?.has(p.id)) return false;
    if (TYPE_CATEGORY_TYPES.has(p.project_type) && typeCategoriesPresent.has(p.project_type) && p.status === "active" && !p.is_private) return false;
    return true;
  });

  const tabDefs: { id: string; label: string }[] = [
    // Restricted (consumer-only) accounts see projects only — never posts.
    ...(restricted ? [] : [{ id: "posts", label: "Posts" }]),
    ...(portfolioCategories ?? []).map((c) => ({ id: categoryToTabId(c.category), label: c.category })),
    ...(typeCategories ?? []).map((c) => ({ id: `type-${c.project_type}`, label: c.category })),
    ...(mediaProjects.length > 0 ? [{ id: "media", label: "Media" }] : []),
    ...(fallbackProjects && fallbackProjects.length > 0 ? [{ id: "projects", label: "Projects" }] : []),
  ];
  const tabIds = tabDefs.map((t) => t.id);
  const [activeTab, setActiveTab] = useTabState<string>(tabIds, tabIds[0] ?? "projects");
  const activeIndex = Math.max(tabIds.indexOf(activeTab), 0);
  const activeDef = tabDefs[activeIndex];

  // Active tab → which data it needs (hooks stay unconditional; inactive ones get undefined and idle).
  const activeCategory = activeDef && !["posts", "media", "projects"].includes(activeDef.id) && !activeDef.id.startsWith("type-") ? activeDef.label : undefined;
  const activeType = activeDef?.id.startsWith("type-") ? (activeDef.id.slice("type-".length) as ProjectType) : undefined;
  const { data: categoryProjects, isLoading: categoryLoading, refetch: refetchCategoryProjects } = usePortfolioCategoryProjects(accountId, activeCategory);
  const { data: categoryGigs, refetch: refetchCategoryGigs } = usePortfolioCategoryGigs(accountId, activeCategory);
  const { data: typeProjects, isLoading: typeLoading, refetch: refetchTypeProjects } = useTypeCategoryProjects(accountId, activeType);

  useRecordProfileVisit(profile?.id);

  // refetch() ignores `enabled`, so a locked/private profile refetches only the profile; the rest are disabled for it.
  // The same goes for the active-tab queries, which idle (undefined key arg) unless their tab is showing.
  const { refreshControl, refreshing } = usePullToRefresh(
    isPrivateLocked
      ? [refetchProfile]
      : [
          refetchProfile,
          refetchProjects,
          refetchPosts,
          refetchPortfolio,
          refetchCategorizedIds,
          refetchTypeCategories,
          refetchCollaboratorMedia,
          ...(activeCategory ? [refetchCategoryProjects, refetchCategoryGigs] : []),
          ...(activeType ? [refetchTypeProjects] : []),
        ]
  );

  const rows = useMemo<Row[]>(() => {
    const base: Row[] = [{ kind: "header" }];
    if (isBlocked) return [...base, { kind: "message", id: "blocked", icon: Ban, text: "You've blocked this account. Unblock to see their content." }];
    if (isPrivateLocked) return base;

    // Restricted account with no projects → no tab bar, just the empty message.
    if (tabDefs.length === 0 && tabsLoading) return [...base, { kind: "skeleton", id: "skeleton-tabs" }];
    if (tabDefs.length === 0) {
      return [...base, { kind: "message", id: "no-projects", text: projectsOwnerView ? "No projects yet — publish your first one." : "No projects yet." }];
    }

    const out: Row[] = [...base, { kind: "tabs" }];
    const id = activeDef.id;

    if (id === "posts") {
      if (postsLoading) out.push({ kind: "postskeleton", id: "skeleton-posts" });
      else if (postsError && (!posts || posts.length === 0)) out.push({ kind: "message", id: "posts-error", icon: RefreshCw, text: "Couldn't load posts. Pull down to retry." });
      else if (!posts || posts.length === 0) out.push({ kind: "message", id: "no-posts", icon: LayoutGrid, text: "No posts yet." });
      else for (const post of posts as any[]) out.push({ kind: "post", id: post.id, post });
    } else if (id === "media") {
      out.push({ kind: "grid", id: "media", projects: mediaProjects });
    } else if (id === "projects") {
      if (fallbackProjects && fallbackProjects.length > 0) out.push({ kind: "grid", id: "projects", projects: fallbackProjects });
      else if (projectsLoading) out.push({ kind: "skeleton", id: "skeleton-projects" });
      else out.push({ kind: "message", id: "no-projects", text: projectsOwnerView ? "No projects yet — publish your first one." : "No projects yet." });
    } else if (id.startsWith("type-")) {
      if (typeLoading) return [...out, { kind: "skeleton", id: "skeleton-type", projectType: activeType }];
      if (!typeProjects || typeProjects.length === 0) out.push({ kind: "message", id: "empty-type", text: "Nothing here yet." });
      // Books: compact 2-up cover grid (same tiles as Discover/search); a tap opens the book's slug page.
      else if (activeType === "book") out.push({ kind: "minigrid", id, projects: typeProjects });
      else out.push({ kind: "grid", id, projects: typeProjects });
    } else {
      if (categoryLoading) return [...out, { kind: "skeleton", id: "skeleton-cat" }];
      if (!categoryProjects || categoryProjects.length === 0) out.push({ kind: "message", id: "empty-cat", text: "Nothing here yet." });
      else {
        if (categoryGigs && categoryGigs.length > 0) out.push({ kind: "gigs", id: "gigs", gigs: categoryGigs });
        out.push({ kind: "grid", id, projects: categoryProjects });
      }
    }
    return out;
  }, [isBlocked, isPrivateLocked, tabDefs.length, tabsLoading, activeDef?.id, posts, postsLoading, postsError, projectsLoading, mediaProjects, fallbackProjects, typeProjects, typeLoading, categoryProjects, categoryGigs, categoryLoading, projectsOwnerView]);

  // ── actions ──
  function startUnfollow() {
    if (isFollowedByUser || profile?.is_private) {
      setShowUnfollowConfirm(true);
      return;
    }
    toggleFollow.mutate(true);
  }

  function handleFollowClick() {
    if (hasPendingRequest) return void cancelFollowRequest.mutate();
    if (profile?.is_private) return void sendFollowRequest.mutate();
    toggleFollow.mutate(false);
  }

  async function handleMessage() {
    if (!profile) return;
    const conversationId = await startConversation.mutateAsync(profile.id);
    router.push(`/messages/${conversationId}` as Href);
  }

  function handleToggleBlock() {
    if (isBlocked) return void toggleBlock.mutate(true);
    setShareSheetOpen(false);
    setShowBlockConfirm(true);
  }

  // ── scroll state ──
  const headerHeightRef = useRef(0);
  const scrollYRef = useRef(0);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      chromeScroll(e);
      const y = e.nativeEvent.contentOffset.y;
      scrollYRef.current = y;
    },
    [chromeScroll]
  );

  function switchTab(index: number) {
    if (index === activeIndex || index < 0 || index >= tabDefs.length) return;
    haptics.selection();
    setActiveTab(tabDefs[index].id);
    // Keep the tab bar pinned: if the header is scrolled out, land the new tab's content at the top.
    if (scrollYRef.current > headerHeightRef.current) listRef.current?.scrollToIndex({ index: 1, animated: false });
  }

  // ── tab bar ──
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const equalTabs = tabDefs.length <= MAX_EQUAL_TABS;
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(activeIndex * (tabBarWidth / Math.max(tabDefs.length, 1)), { duration: 280, easing: Easing.out(Easing.cubic) }) }],
  }));

  function renderTabs() {
    const cell = tabBarWidth / Math.max(tabDefs.length, 1);
    return (
      <View className="bg-canvas" style={{ shadowColor: `rgb(${colors.shadowInkRgb})`, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
        <View className="px-4">
          <View accessibilityRole="tablist" className="relative flex-row items-stretch border-b border-border" onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}>
            {tabDefs.map((tab, i) => {
              const TabIcon = profileTabIcon(tab.id, tab.label);
              const isActive = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => switchTab(i)}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: isActive }}
                  className={`h-12 items-center justify-center ${equalTabs ? "flex-1" : "px-3"} ${!equalTabs && isActive ? "border-b-[3px] border-accent" : ""}`}
                >
                  <Icon as={TabIcon} size={24} strokeWidth={isActive ? 2.25 : 1.75} className={isActive ? "text-accent" : "text-ink-muted"} />
                </Pressable>
              );
            })}
            {equalTabs ? (
              <Animated.View pointerEvents="none" className="absolute bottom-0 left-0 h-[3px] items-center" style={[{ width: cell }, indicatorStyle]}>
                <View className="h-full w-9 rounded-full bg-accent" />
              </Animated.View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  // ── toolbar + header ──
  const ownerMenuItems: DropdownMenuItem[] = profile
    ? [
        { key: "activity", label: "Activity", icon: <Icon as={ActivityIcon} size={22} className="text-overlay-ink" />, onSelect: () => router.push("/activity") },
        ...(profile.is_private
          ? ([
              {
                key: "follow-requests",
                label: "Follow requests",
                icon: <Icon as={UserCheck} size={22} className="text-overlay-ink" />,
                badge:
                  incomingRequestCount > 0 ? (
                    <View className="h-4 w-4 shrink-0 items-center justify-center rounded-full bg-overlay-danger">
                      <Text className="text-[10px] font-medium text-overlay-surface">{incomingRequestCount > 9 ? "9+" : incomingRequestCount}</Text>
                    </View>
                  ) : undefined,
                onSelect: () => router.push("/requests"),
              },
            ] satisfies DropdownMenuItem[])
          : []),
        ...(restricted
          ? []
          : ([
              { key: "gigs", label: "Your Gigs", icon: <Icon as={Briefcase} size={22} className="text-overlay-ink" />, onSelect: () => router.push("/gigs") },
              { key: "page", label: "Page", icon: <Icon as={Building2} size={22} className="text-overlay-ink" />, onSelect: () => setPagesOpen(true) },
            ] satisfies DropdownMenuItem[])),
        { key: "wallet", label: "Wallet", icon: <Icon as={Wallet} size={22} className="text-overlay-ink" />, onSelect: () => router.push("/wallet") },
      ]
    : [];

  function renderToolbar() {
    if (!profile) return null;
    return (
      <View className="h-14 flex-row items-center gap-1 px-3">
        {showOwnerView ? (
          <>
            <Pressable onPress={() => router.push("/settings/profile")} accessibilityRole="button" accessibilityLabel="Edit profile" className="h-10 w-10 items-center justify-center rounded-full">
              <Icon as={Pencil} size={22} className="text-ink" />
            </Pressable>
            <ProfileAdSlot className="mx-1 min-w-0 flex-1" />
            {!restricted ? (
              <Pressable onPress={() => router.push("/create")} accessibilityRole="button" accessibilityLabel="Create" className="h-10 w-10 items-center justify-center rounded-full">
                <Icon as={Plus} size={26} className="text-ink" />
              </Pressable>
            ) : null}
            <View ref={ownerMenuButtonRef} collapsable={false}>
              <Pressable onPress={() => setOwnerMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Profile options" className="relative h-10 w-10 items-center justify-center rounded-full">
                <Icon as={Menu} size={24} className="text-ink" />
                {incomingRequestCount > 0 ? (
                  <View className="absolute right-1 top-1 h-4 w-4 items-center justify-center rounded-full bg-danger">
                    <Text className="text-[10px] font-medium text-canvas">{incomingRequestCount > 9 ? "9+" : incomingRequestCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </>
        ) : isOwnProfile ? (
          <View className="w-full flex-row items-center justify-end">
            <Pressable onPress={() => setPreviewingAsVisitor(false)} accessibilityRole="button" className="flex-row items-center gap-1.5 rounded-full bg-accent-soft px-3 py-2">
              <Icon as={X} size={14} className="text-accent" />
              <Text className="text-sm font-medium text-accent">Exit preview</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View className="flex-1" />
            <Pressable onPress={() => setQrShareOpen(true)} accessibilityRole="button" accessibilityLabel="Share profile" className="h-10 w-10 items-center justify-center rounded-full">
              <Icon as={Share2} size={22} className="text-ink" />
            </Pressable>
            <Pressable onPress={() => setShareSheetOpen(true)} accessibilityRole="button" accessibilityLabel="More options" className="h-10 w-10 items-center justify-center rounded-full">
              <Icon as={MoreHorizontal} size={22} className="text-ink" />
            </Pressable>
          </>
        )}
      </View>
    );
  }

  function renderHeader() {
    if (!profile) return null;
    const followBusy = toggleFollow.isPending || sendFollowRequest.isPending || cancelFollowRequest.isPending || isBlocked;
    return (
      <View onLayout={(e) => (headerHeightRef.current = e.nativeEvent.layout.height)} className="bg-canvas">
        {renderToolbar()}

        <View className="px-4 pt-2">
          {isOwnProfile && previewingAsVisitor ? (
            <View className="mb-4 flex-row items-center gap-1.5 rounded-xl bg-accent-soft px-4 py-2.5">
              <Icon as={Eye} size={14} className="text-accent" />
              <Text className="text-sm text-accent">Viewing your profile as a visitor sees it</Text>
            </View>
          ) : null}

          <View className="flex-row items-start justify-between gap-4">
            <View className="min-w-0 flex-1 pt-1">
              <View className="flex-row flex-wrap items-center gap-2">
                {showOwnerView ? (
                  <Pressable onPress={() => setAccountSwitcherOpen(true)} accessibilityRole="button" accessibilityLabel="Switch account" className="shrink flex-row items-center gap-1">
                    <Text className="shrink text-[28px] font-bold leading-tight tracking-tight text-ink">{profile.display_name}</Text>
                    <Icon as={ChevronDown} size={18} className="mt-1 text-ink-muted" />
                  </Pressable>
                ) : (
                  <Text className="shrink text-[28px] font-bold leading-tight tracking-tight text-ink">{displayName}</Text>
                )}
                <TierBadge tier={profile.tier} />
              </View>

              <Text numberOfLines={1} className="mt-0.5 text-base text-ink-muted">
                @{profile.username}
              </Text>

              {profile.badge_visible ? <VerifiedBadge size={15} label className="mt-1" /> : null}
              {showOwnerView && profile.badge_streak != null ? (
                <BadgeStreakNote visible={!!profile.badge_visible} streak={profile.badge_streak} />
              ) : null}
              {profile.roles.length > 0 ? <RoleTags roles={profile.roles} className="mt-1 text-xs text-ink-muted" /> : null}

            </View>

            <View className="shrink-0">
              <View className="rounded-full border-2 border-border p-[3px]">
                {profile.avatar_url ? (
                  <Pressable onPress={() => setAvatarOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="View profile photo">
                    <Avatar src={profile.avatar_url} name={profile.display_name} size="2xl" />
                  </Pressable>
                ) : (
                  <Avatar src={profile.avatar_url} name={profile.display_name} size="2xl" />
                )}
              </View>
              {showOwnerView ? (
                <Pressable
                  onPress={() => router.push("/settings/profile")}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  className="absolute -bottom-1 -right-1 h-9 w-9 items-center justify-center rounded-full border-[3px] border-canvas bg-accent"
                >
                  <Icon as={Plus} size={18} strokeWidth={2.75} className="text-white" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Stats row — Following / Followers on the left, Pages on the right (under the avatar). */}
          <View className="mt-5 flex-row items-center justify-between gap-4">
            <View className="flex-row items-center gap-7">
              <Pressable onPress={() => router.push(`/profile/${profile.username}/following` as Href)} accessibilityRole="link" accessibilityLabel={`${profile.following_count} following`}>
                <Text className="text-xl font-semibold text-ink">{profile.following_count}</Text>
                <Text className="mt-1 text-sm text-ink-muted">Following</Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/profile/${profile.username}/followers` as Href)} accessibilityRole="link" accessibilityLabel={`${profile.follower_count} followers`}>
                <Text className="text-xl font-semibold text-ink">{profile.follower_count}</Text>
                <Text className="mt-1 text-sm text-ink-muted">Followers</Text>
              </Pressable>
            </View>
            <Pressable
              disabled={!pagesIconEnabled}
              onPress={() => setPagesOpen(true)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !pagesIconEnabled }}
              accessibilityLabel={pagesIconEnabled ? "View pages" : "Not affiliated with any pages"}
              className={`mr-1 h-11 w-11 shrink-0 items-center justify-center rounded-full ${pagesIconEnabled ? "active:scale-95" : "opacity-40"}`}
            >
              <Icon as={Building2} size={26} strokeWidth={2} className={pagesIconEnabled ? "text-brand-orange" : "text-ink-muted"} />
            </Pressable>
          </View>

          {profile.bio ? <Text className="mt-5 text-[15px] leading-relaxed text-ink">{profile.bio}</Text> : null}

          {websites.length > 0 ? (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {websites.map((url) => (
                <Pressable
                  key={url}
                  onPress={() => void openExternal(getWebsiteHref(url))}
                  accessibilityRole="link"
                  accessibilityLabel={`Website ${getWebsiteDomain(url)}`}
                  className="max-w-full flex-row items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5"
                >
                  <Icon as={Link2} size={14} className="text-accent" />
                  <Text numberOfLines={1} className="shrink text-sm font-medium text-accent">
                    {getWebsiteDomain(url)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Action row — icon-led. The owner gets quick actions; a visitor gets the one follow control that
              matches the relationship (follow / follow back / requested / following) plus message. */}
          <View className="mb-4 mt-5 flex-row items-center gap-2">
            {showOwnerView ? (
              <>
                <Pressable onPress={() => setQrShareOpen(true)} accessibilityRole="button" accessibilityLabel="Share profile" className="h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface">
                  <Icon as={Share2} size={20} className="text-ink" />
                </Pressable>
                <Pressable onPress={() => setPreviewingAsVisitor(true)} accessibilityRole="button" accessibilityLabel="View as visitor" className="h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface">
                  <Icon as={Eye} size={20} className="text-ink" />
                </Pressable>
                <Pressable onPress={() => router.push("/activity")} accessibilityRole="button" accessibilityLabel="Activity" className="h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface">
                  <Icon as={ActivityIcon} size={20} className="text-ink" />
                </Pressable>
              </>
            ) : isOwnProfile ? null : (
              <>
                {isFollowing ? (
                  <View ref={relationshipMenuButtonRef} collapsable={false} className="flex-1">
                    <Pressable
                      onPress={() => setRelationshipMenuOpen(true)}
                      disabled={isBlocked}
                      accessibilityRole="button"
                      accessibilityLabel="Following — open options"
                      className={`h-11 flex-row items-center justify-center gap-2 rounded-xl bg-accent-soft ${isBlocked ? "opacity-40" : ""}`}
                    >
                      <Icon as={UserCheck} size={19} className="text-accent" />
                      <Text className="text-[15px] font-semibold text-accent">Following</Text>
                      <Icon as={ChevronDown} size={16} className="text-accent" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={handleFollowClick}
                    disabled={followBusy}
                    accessibilityRole="button"
                    className={`h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl ${followBusy ? "opacity-40" : ""} ${
                      hasPendingRequest ? "bg-accent-soft" : isFollowedByUser ? "bg-pushback-a15" : "bg-accent"
                    }`}
                  >
                    <Icon
                      as={hasPendingRequest ? Clock : UserPlus}
                      size={19}
                      className={hasPendingRequest ? "text-accent" : isFollowedByUser ? "text-pushback" : "text-white"}
                    />
                    <Text className={`text-[15px] font-semibold ${hasPendingRequest ? "text-accent" : isFollowedByUser ? "text-pushback" : "text-white"}`}>
                      {hasPendingRequest ? "Requested" : isFollowedByUser ? "Follow back" : "Follow"}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => void handleMessage()}
                  disabled={startConversation.isPending || isBlocked}
                  accessibilityRole="button"
                  accessibilityLabel="Message"
                  className={`h-11 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface ${startConversation.isPending || isBlocked ? "opacity-40" : ""}`}
                >
                  <Icon as={MessageCircle} size={20} className="text-ink" />
                </Pressable>
              </>
            )}
          </View>
        </View>

        {isPrivateLocked ? (
          <View className="items-center px-6 py-14">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
              <Icon as={Lock} size={22} className="text-accent" />
            </View>
            <Text className="font-medium text-ink">This account is private</Text>
            <Text className="mt-1 max-w-xs text-center text-sm text-ink-muted">Follow {firstName || "this account"} to see their {restricted ? "projects" : "posts and projects"}.</Text>
          </View>
        ) : null}
      </View>
    );
  }

  function renderRow({ item }: { item: Row }) {
    switch (item.kind) {
      case "header":
        return renderHeader();
      case "tabs":
        return renderTabs();
      case "post":
        return (
          <View className="px-5 pt-4">
            <PostCard post={item.post} isOwnerView={showOwnerView} />
          </View>
        );
      case "grid":
        return (
          <View className="px-4 pt-4">
            <ProjectCardList projects={item.projects} isOwnerView={projectsOwnerView} />
          </View>
        );
      case "minigrid":
        return (
          <View className="px-4 pt-4">
            <ProjectMiniGrid projects={item.projects} />
          </View>
        );
      case "postskeleton":
        return (
          <View className="px-5 pt-4">
            <PostListSkeleton />
          </View>
        );
      case "skeleton":
        return (
          <View className="px-4 pt-4">
            <ProjectGridSkeleton projectType={item.projectType} />
          </View>
        );
      case "gigs":
        return (
          <View className="px-4 pt-4">
            <Animated.ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
              {item.gigs.map((gig) => (
                <ProjectMiniCard key={gig.id} project={gig} />
              ))}
            </Animated.ScrollView>
          </View>
        );
      case "message":
        return <Message text={item.text} icon={item.icon} />;
    }
  }

  // Pull-to-refresh clears only the content (posts, projects, grid…) — the profile header and the
  // tab bar stay put, like the top bar and bottom nav do, and a skeleton stands in below them.
  const listRows = refreshing ? rows.filter((r) => r.kind === "header" || r.kind === "tabs") : rows;
  const tabsIndex = listRows.findIndex((r) => r.kind === "tabs");

  if (isLoading) return <ProfilePageSkeleton />;
  if (!profile) {
    // Offline, a missing profile means "never loaded on this device", not "doesn't exist".
    if (!online) return <OfflineUnavailable subject="profile" />;
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Profile not found.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <SwipeToSwitch index={activeIndex} count={tabDefs.length} onIndexChange={switchTab} enabled={!isPrivateLocked && !isBlocked && tabDefs.length > 1}>
        <FlashList showsHorizontalScrollIndicator={false}
          ref={listRef}
          data={listRows}
          refreshControl={refreshControl}
          ListFooterComponent={refreshing ? <RefreshSkeleton /> : null}
          keyExtractor={(r) => (r.kind === "header" || r.kind === "tabs" ? r.kind : r.id)}
          getItemType={(r) => r.kind}
          renderItem={renderRow}
          stickyHeaderIndices={tabsIndex >= 0 ? [tabsIndex] : undefined}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
        />
      </SwipeToSwitch>

      {/* Floating actions, above the bottom nav. */}
      <View pointerEvents="box-none" className="absolute right-4 items-end gap-3" style={{ bottom: bottomInset + FAB_SIZE + FAB_GAP + 4 }}>
        {fromFeedPostId ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <Pressable
              onPress={() => router.dismissTo({ pathname: "/feed", params: { scrollToPostId: fromFeedPostId } })}
              accessibilityRole="button"
              accessibilityLabel="Back to the post you came from"
              className="flex-row items-center gap-1.5 rounded-full bg-ink py-2.5 pl-3 pr-4"
              style={{ elevation: 6 }}
            >
              <Icon as={Undo2} size={16} className="text-canvas" />
              <Text className="text-sm font-medium text-canvas">Back to post</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      {ownerMenuOpen ? <DropdownMenu title="Menu" anchorRef={ownerMenuButtonRef} onClose={() => setOwnerMenuOpen(false)} width={256} items={ownerMenuItems} bottomInset={bottomInset} /> : null}

      {relationshipMenuOpen ? (
        <DropdownMenu title="Following"
          anchorRef={relationshipMenuButtonRef}
          onClose={() => setRelationshipMenuOpen(false)}
          width={224}
          items={[
            {
              key: "mute",
              label: isMuted ? "Unmute" : "Mute their updates",
              icon: <Icon as={isMuted ? Bell : BellOff} size={22} className="text-overlay-ink" />,
              onSelect: () => toggleMute.mutate(isMuted),
            },
            "divider",
            { key: "unfollow", label: "Unfollow", icon: <Icon as={UserMinus} size={22} className="text-overlay-danger" />, variant: "danger", disabled: toggleFollow.isPending, onSelect: startUnfollow },
          ]}
        />
      ) : null}

      {accountSwitcherOpen ? <AccountSwitcher onClose={() => setAccountSwitcherOpen(false)} /> : null}

      {avatarOpen && profile.avatar_url ? <MediaViewer mediaUrls={[profile.avatar_url]} startIndex={0} onClose={() => setAvatarOpen(false)} /> : null}

      {shareSheetOpen && !showOwnerView ? (
        <ShareProfileSheet
          profile={{ id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url }}
          isFollowedByUser={isFollowedByUser}
          isBlocked={isBlocked}
          isMuted={isMuted}
          onToggleBlock={handleToggleBlock}
          onToggleMute={() => toggleMute.mutate(isMuted)}
          onRemoveFollower={() => {
            setShareSheetOpen(false);
            setShowRemoveFollowerConfirm(true);
          }}
          onOpenQR={() => setQrShareOpen(true)}
          onReportContent={() => setReportContentOpen(true)}
          onClose={() => setShareSheetOpen(false)}
        />
      ) : null}

      {pagesOpen && showOwnerView ? <ProfilePagesModal mode="owner" onClose={() => setPagesOpen(false)} /> : null}
      {pagesOpen && !showOwnerView && hasPages ? (
        <ProfilePagesModal mode="visitor" pages={profilePagesQuery.data ?? []} onClose={() => setPagesOpen(false)} />
      ) : null}

      {reportContentOpen ? <ReportModal profileId={profile.id} onClose={() => setReportContentOpen(false)} /> : null}

      {qrShareOpen ? (
        <ProfileShareScreen
          name={profile.display_name}
          handle={profile.username}
          avatarUrl={profile.avatar_url}
          url={`${APP_URL}/profile/${profile.username}`}
          onClose={() => setQrShareOpen(false)}
        />
      ) : null}

      {showUnfollowConfirm ? (
        <ConfirmDialog
          title={`Unfollow ${firstName || "this account"}?`}
          description={
            isFollowedByUser && profile.is_private
              ? `You and ${firstName} are friends, and this account is private — you'll need to send a new follow request and be approved again to follow them.`
              : isFollowedByUser
                ? `You and ${firstName} are friends. Still want to unfollow?`
                : "This account is private. If you unfollow, you'll need to send a new follow request and be approved again."
          }
          confirmLabel="Unfollow"
          danger={false}
          onConfirm={() => {
            toggleFollow.mutate(true);
            setShowUnfollowConfirm(false);
          }}
          onCancel={() => setShowUnfollowConfirm(false)}
        />
      ) : null}

      {showRemoveFollowerConfirm ? (
        <ConfirmDialog
          title={`Remove ${firstName || "this follower"}?`}
          description={`${firstName || "They"} will stop following you and won't be notified. They can choose to follow you again later.`}
          confirmLabel={removeFollower.isPending ? "Removing…" : "Remove"}
          onConfirm={() =>
            removeFollower.mutate(undefined, {
              onSuccess: () => {
                setShowRemoveFollowerConfirm(false);
                toast(`Removed ${firstName || "this follower"}.`, { variant: "success" });
              },
            })
          }
          onCancel={() => setShowRemoveFollowerConfirm(false)}
        />
      ) : null}

      {showBlockConfirm ? (
        <ConfirmDialog
          title={`Block ${firstName || "this account"}?`}
          description={`${firstName || "They"} won't be able to find your profile, message you, or see anything you post. You'll also unfollow each other. You can unblock them anytime from Settings.`}
          confirmLabel={toggleBlock.isPending ? "Blocking…" : "Block"}
          onConfirm={() =>
            toggleBlock.mutate(false, {
              onSuccess: () => {
                setShowBlockConfirm(false);
                toast(`Blocked ${firstName || "this account"}.`, { variant: "success" });
              },
            })
          }
          onCancel={() => setShowBlockConfirm(false)}
        />
      ) : null}
    </View>
  );
}
