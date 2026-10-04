// src/screens/ProfilePage.tsx
// A person's profile: toolbar · identity block · stats · sticky tab bar · the
// active tab's content (Posts, portfolio categories, Media, Projects…).
//
// Native structure: ONE vertical list. The header and the tab bar are the first
// two rows (the tab bar is a sticky header, so it pins under the status bar
// when the identity block scrolls away), and the rows after them are the active
// tab's items — so the whole page scrolls as a single virtualized surface.
// Swiping sideways switches tab (SwipeToSwitch).
//
// Project items render as mini cards here until the full ProjectCard arrives
// with the Projects build step.
import {
  Activity as ActivityIcon,
  ArrowUp,
  Bell,
  BellOff,
  Briefcase,
  Building2,
  ChevronDown,
  Eye,
  Globe,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Redo2,
  Send,
  Settings,
  Undo2,
  UserCheck,
  UserMinus,
  Wallet,
  X,
} from "lucide-react-native";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { PostCard } from "@/components/post/PostCard";
import { ProjectMiniCard, ProjectMiniGrid } from "@/components/post/ProjectMiniCard";
import { AccountSwitcher } from "@/components/account/AccountSwitcher";
import { ProfileAdSlot } from "@/components/profile/ProfileAdSlot";
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
import { MediaViewer } from "@/components/post/MediaViewer";
import { useAuth } from "@/hooks/useAuth";
import { useContactNickname } from "@/hooks/useContactNicknames";
import { useCancelFollowRequest, useHasPendingFollowRequest, useIncomingFollowRequestCount, useSendFollowRequest } from "@/hooks/useFollowRequests";
import { useStartConversation } from "@/hooks/useMessaging";
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
import { useIsBlocked, useIsMuted, useRemoveFollower, useToggleBlock, useToggleMute } from "@/hooks/usePrivacy";
import { useIsFollowedByUser, useIsFollowingAsActiveIdentity, useProfileByUsername, useToggleFollowAsActiveIdentity } from "@/hooks/useProfile";
import { useRecordProfileVisit } from "@/hooks/useProfileVisits";
import { useUserProjects, type Project, type ProjectType } from "@/hooks/useProjects";
import { useTabState } from "@/hooks/useTabState";
import { APP_URL } from "@/lib/config";
import { haptics } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const SCROLL_TOP_THRESHOLD = 480;
const MAX_EQUAL_TABS = 4;
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
  | { kind: "gigs"; id: string; gigs: Project[] }
  | { kind: "message"; id: string; text: string };

function Message({ text }: { text: string }) {
  return <Text className="px-4 py-10 text-center text-sm text-ink-muted">{text}</Text>;
}

export function ProfilePage() {
  const { username, fromPost } = useLocalSearchParams<{ username: string; fromPost?: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const chromeScroll = useChromeScroll();
  const toast = useToast();
  const startConversation = useStartConversation();
  const listRef = useRef<FlashListRef<Row>>(null);

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

  // "Back to post" only when this page was reached from a feed post's byline.
  const [fromFeedPostId] = useState<string | null>(() => fromPost ?? null);
  useEffect(() => {
    if (fromPost) router.setParams({ fromPost: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: profile, isLoading } = useProfileByUsername(username ?? "");

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
  const showOwnerView = isOwnProfile && !previewingAsVisitor;
  const isFollowing = !!isFollowingQuery.data;
  const isFollowedByUser = !!isFollowedByUserQuery.data;
  const hasPendingRequest = !!hasPendingRequestQuery.data;
  const isBlocked = !!isBlockedQuery.data;
  const isMuted = !!isMutedQuery.data;
  const displayName = nickname || profile?.display_name || "";
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? "";
  const isPrivateLocked = !!profile?.is_private && !showOwnerView && !isFollowing;

  const accountId = isPrivateLocked ? undefined : profile?.id;
  const { data: projects } = useUserProjects(isPrivateLocked ? "" : profile?.id ?? "", showOwnerView);
  const { data: posts } = useUserPostsWithArchived(isPrivateLocked ? "" : profile?.id ?? "", false);
  const { data: portfolioCategories } = usePortfolioCategories(accountId);
  const { data: categorizedProjectIds } = useCategorizedProjectIds(accountId);
  const { data: typeCategories } = useTypePortfolioCategories(accountId);
  const { data: collaboratorMedia } = useCollaboratorMediaProjects(accountId);

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
    { id: "posts", label: "Posts" },
    ...(portfolioCategories ?? []).map((c) => ({ id: categoryToTabId(c.category), label: c.category })),
    ...(typeCategories ?? []).map((c) => ({ id: `type-${c.project_type}`, label: c.category })),
    ...(mediaProjects.length > 0 ? [{ id: "media", label: "Media" }] : []),
    ...(fallbackProjects && fallbackProjects.length > 0 ? [{ id: "projects", label: "Projects" }] : []),
  ];
  const tabIds = tabDefs.map((t) => t.id);
  const [activeTab, setActiveTab] = useTabState<string>(tabIds, "posts");
  const activeIndex = Math.max(tabIds.indexOf(activeTab), 0);
  const activeDef = tabDefs[activeIndex];

  // Active tab → which data it needs (hooks stay unconditional; inactive ones get undefined and idle).
  const activeCategory = activeDef && !["posts", "media", "projects"].includes(activeDef.id) && !activeDef.id.startsWith("type-") ? activeDef.label : undefined;
  const activeType = activeDef?.id.startsWith("type-") ? (activeDef.id.slice("type-".length) as ProjectType) : undefined;
  const { data: categoryProjects, isLoading: categoryLoading } = usePortfolioCategoryProjects(accountId, activeCategory);
  const { data: categoryGigs } = usePortfolioCategoryGigs(accountId, activeCategory);
  const { data: typeProjects, isLoading: typeLoading } = useTypeCategoryProjects(accountId, activeType);

  useRecordProfileVisit(profile?.id);

  const rows = useMemo<Row[]>(() => {
    const base: Row[] = [{ kind: "header" }];
    if (isBlocked) return [...base, { kind: "message", id: "blocked", text: "You've blocked this account. Unblock to see their content." }];
    if (isPrivateLocked) return base;

    const out: Row[] = [...base, { kind: "tabs" }];
    const id = activeDef?.id ?? "posts";

    if (id === "posts") {
      if (!posts || posts.length === 0) out.push({ kind: "message", id: "no-posts", text: "No posts yet." });
      else for (const post of posts as any[]) out.push({ kind: "post", id: post.id, post });
    } else if (id === "media") {
      out.push({ kind: "grid", id: "media", projects: mediaProjects });
    } else if (id === "projects") {
      if (fallbackProjects && fallbackProjects.length > 0) out.push({ kind: "grid", id: "projects", projects: fallbackProjects });
      else out.push({ kind: "message", id: "no-projects", text: showOwnerView ? "No projects yet — publish your first one." : "No projects yet." });
    } else if (id.startsWith("type-")) {
      if (typeLoading) return out;
      if (!typeProjects || typeProjects.length === 0) out.push({ kind: "message", id: "empty-type", text: "Nothing here yet." });
      else out.push({ kind: "grid", id, projects: typeProjects });
    } else {
      if (categoryLoading) return out;
      if (!categoryProjects || categoryProjects.length === 0) out.push({ kind: "message", id: "empty-cat", text: "Nothing here yet." });
      else {
        if (categoryGigs && categoryGigs.length > 0) out.push({ kind: "gigs", id: "gigs", gigs: categoryGigs });
        out.push({ kind: "grid", id, projects: categoryProjects });
      }
    }
    return out;
  }, [isBlocked, isPrivateLocked, activeDef?.id, posts, mediaProjects, fallbackProjects, typeProjects, typeLoading, categoryProjects, categoryGigs, categoryLoading, showOwnerView]);

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
  const [showScrollTop, setShowScrollTop] = useState(false);
  const headerHeightRef = useRef(0);
  const scrollYRef = useRef(0);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      chromeScroll(e);
      const y = e.nativeEvent.contentOffset.y;
      scrollYRef.current = y;
      setShowScrollTop((prev) => {
        const next = y > SCROLL_TOP_THRESHOLD;
        return prev === next ? prev : next;
      });
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
    return (
      <View className="bg-canvas" style={{ shadowColor: `rgb(${colors.shadowInkRgb})`, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 }}>
        <View className="px-4">
          <View className="relative flex-row items-stretch border-b border-border" onLayout={(e) => setTabBarWidth(e.nativeEvent.layout.width)}>
            {tabDefs.map((tab, i) => (
              <Pressable
                key={tab.id}
                onPress={() => switchTab(i)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === tab.id }}
                className={`items-center py-3 ${equalTabs ? "flex-1" : "px-4"} ${!equalTabs && activeTab === tab.id ? "border-b-2 border-accent" : ""}`}
              >
                <Text numberOfLines={1} className={`text-sm font-medium ${activeTab === tab.id ? "text-accent" : "text-ink-muted"}`}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
            {equalTabs ? (
              <Animated.View
                pointerEvents="none"
                className="absolute bottom-0 left-0 h-[2px] rounded-full bg-accent"
                style={[{ width: tabBarWidth / Math.max(tabDefs.length, 1) }, indicatorStyle]}
              />
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
        { key: "gigs", label: "Your Gigs", icon: <Icon as={Briefcase} size={22} className="text-overlay-ink" />, onSelect: () => router.push("/gigs") },
        { key: "page", label: "Page", icon: <Icon as={Building2} size={22} className="text-overlay-ink" />, onSelect: () => router.push("/pages") },
        { key: "wallet", label: "Wallet", icon: <Icon as={Wallet} size={22} className="text-overlay-ink" />, onSelect: () => router.push("/wallet") },
        { key: "view-as-visitor", label: "View as visitor", icon: <Icon as={Eye} size={22} className="text-overlay-ink" />, onSelect: () => setPreviewingAsVisitor(true) },
        { key: "settings", label: "Settings", icon: <Icon as={Settings} size={22} className="text-overlay-ink" />, onSelect: () => router.push("/settings/profile") },
        { key: "share", label: "Share profile", icon: <Icon as={Redo2} size={22} className="text-overlay-ink" />, onSelect: () => setQrShareOpen(true) },
      ]
    : [];

  function renderToolbar() {
    if (!profile) return null;
    return (
      <View className="h-14 flex-row items-center px-4">
        {showOwnerView ? (
          <View className="w-full flex-row items-center gap-2">
            <ProfileAdSlot className="min-w-0 flex-1" />
            <Pressable onPress={() => router.push("/create")} accessibilityRole="button" accessibilityLabel="Create" hitSlop={8} className="shrink-0 p-2">
              <Icon as={Plus} size={22} className="text-ink-muted" />
            </Pressable>
            <View ref={ownerMenuButtonRef} collapsable={false}>
              <Pressable onPress={() => setOwnerMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Profile options" className="relative p-2">
                <Icon as={MoreHorizontal} size={20} className="text-ink-muted" />
                {incomingRequestCount > 0 ? (
                  <View className="absolute right-0.5 top-0.5 h-4 w-4 items-center justify-center rounded-full bg-danger">
                    <Text className="text-[10px] font-medium text-canvas">{incomingRequestCount > 9 ? "9+" : incomingRequestCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
        ) : isOwnProfile ? (
          <View className="w-full flex-row items-center justify-end">
            <Pressable onPress={() => setPreviewingAsVisitor(false)} accessibilityRole="button" className="flex-row items-center gap-1 px-2 py-1.5">
              <Icon as={X} size={14} className="text-accent" />
              <Text className="text-sm font-medium text-accent">Exit preview</Text>
            </Pressable>
          </View>
        ) : isFollowing ? (
          <View className="w-full flex-row items-center justify-end gap-2">
            <View ref={relationshipMenuButtonRef} collapsable={false}>
              <Pressable
                onPress={() => setRelationshipMenuOpen(true)}
                disabled={isBlocked}
                accessibilityRole="button"
                className={`flex-row items-center gap-1.5 rounded-full bg-accent-soft py-2 pl-4 pr-3 ${isBlocked ? "opacity-40" : ""}`}
              >
                <Icon as={UserCheck} size={16} className="text-accent" />
                <Text className="text-sm font-medium text-accent">Following</Text>
                <Icon as={ChevronDown} size={14} className="text-accent" />
              </Pressable>
            </View>
            <Pressable onPress={() => setShareSheetOpen(true)} accessibilityRole="button" accessibilityLabel="More options" hitSlop={8} className="p-2">
              <Icon as={MoreHorizontal} size={18} className="text-ink-muted" />
            </Pressable>
          </View>
        ) : (
          <View className="w-full flex-row items-center justify-end gap-2">
            <Pressable
              onPress={() => void handleMessage()}
              disabled={startConversation.isPending || isBlocked}
              accessibilityRole="button"
              className={`flex-row items-center gap-1.5 rounded-full border border-border px-4 py-2 ${startConversation.isPending || isBlocked ? "opacity-40" : ""}`}
            >
              <Icon as={MessageCircle} size={16} className="text-ink-muted" />
              <Text className="text-sm text-ink-muted">Message</Text>
            </Pressable>
            <Pressable
              onPress={handleFollowClick}
              disabled={toggleFollow.isPending || sendFollowRequest.isPending || cancelFollowRequest.isPending || isBlocked}
              accessibilityRole="button"
              className={`rounded-full px-5 py-2 ${
                toggleFollow.isPending || sendFollowRequest.isPending || cancelFollowRequest.isPending || isBlocked ? "opacity-40" : ""
              } ${hasPendingRequest ? "bg-accent-soft" : isFollowedByUser ? "bg-pushback/15" : "bg-ink/10"}`}
            >
              <Text className={`text-sm font-medium ${hasPendingRequest ? "text-accent" : isFollowedByUser ? "text-pushback" : "text-ink"}`}>
                {hasPendingRequest ? "Requested" : isFollowedByUser ? "Follow back" : "Follow"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setShareSheetOpen(true)} accessibilityRole="button" accessibilityLabel="More options" hitSlop={8} className="p-2">
              <Icon as={MoreHorizontal} size={18} className="text-ink-muted" />
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  function renderHeader() {
    if (!profile) return null;
    return (
      <View onLayout={(e) => (headerHeightRef.current = e.nativeEvent.layout.height)} className="bg-canvas">
        {renderToolbar()}

        <View className="px-4 pt-4">
          {isOwnProfile && previewingAsVisitor ? (
            <View className="mb-4 flex-row items-center gap-1.5 rounded-xl bg-accent-soft px-4 py-2.5">
              <Icon as={Eye} size={14} className="text-accent" />
              <Text className="text-sm text-accent">Viewing your profile as a visitor sees it</Text>
            </View>
          ) : null}

          <View className="flex-row items-start gap-4">
            {profile.avatar_url ? (
              <Pressable onPress={() => setAvatarOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="View profile photo" className="shrink-0">
                <Avatar src={profile.avatar_url} name={profile.display_name} size="lg" />
              </Pressable>
            ) : (
              <Avatar src={profile.avatar_url} name={profile.display_name} size="lg" />
            )}

            <View className="min-w-0 flex-1 pt-1">
              <View className="flex-row flex-wrap items-center gap-2">
                {showOwnerView ? (
                  <Pressable onPress={() => setAccountSwitcherOpen(true)} accessibilityRole="button" accessibilityLabel="Switch account">
                    <Text className="text-lg font-medium text-ink">{profile.display_name}</Text>
                  </Pressable>
                ) : (
                  <Text className="text-lg font-medium text-ink">{displayName}</Text>
                )}
                <TierBadge tier={profile.tier} />
              </View>

              {profile.is_verified ? <VerifiedBadge size={15} label className="mt-1" /> : null}
              {profile.roles.length > 0 ? <RoleTags roles={profile.roles} className="mt-0.5 text-xs text-ink-muted" /> : null}

              <Text className="mt-0.5 text-sm text-ink-muted">
                @{profile.username}
                {profile.website_url ? (
                  <>
                    {" / "}
                    <Text className="text-accent" accessibilityRole="link" onPress={() => void Linking.openURL(getWebsiteHref(profile.website_url!))}>
                      {getWebsiteDomain(profile.website_url)}
                    </Text>
                  </>
                ) : null}
              </Text>
            </View>
          </View>

          {profile.bio ? <Text className="mt-4 text-ink">{profile.bio}</Text> : null}

          <View className="mb-4 mt-4 flex-row flex-wrap items-center gap-5">
            <Pressable onPress={() => router.push(`/profile/${profile.username}/following` as Href)} accessibilityRole="link">
              <Text className="text-sm">
                <Text className="font-medium text-ink">{profile.following_count}</Text>
                <Text className="text-ink-muted"> Following</Text>
              </Text>
            </Pressable>
            <Pressable onPress={() => router.push(`/profile/${profile.username}/followers` as Href)} accessibilityRole="link">
              <Text className="text-sm">
                <Text className="font-medium text-ink">{profile.follower_count}</Text>
                <Text className="text-ink-muted"> Followers</Text>
              </Text>
            </Pressable>
          </View>
        </View>

        {isPrivateLocked ? (
          <View className="items-center px-6 py-14">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
              <Icon as={Lock} size={22} className="text-accent" />
            </View>
            <Text className="font-medium text-ink">This account is private</Text>
            <Text className="mt-1 max-w-xs text-center text-sm text-ink-muted">Follow {firstName || "this account"} to see their posts and projects.</Text>
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
            <ProjectMiniGrid projects={item.projects} />
          </View>
        );
      case "gigs":
        return (
          <View className="px-4 pt-4">
            <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
              {item.gigs.map((gig) => (
                <ProjectMiniCard key={gig.id} project={gig} />
              ))}
            </Animated.ScrollView>
          </View>
        );
      case "message":
        return <Message text={item.text} />;
    }
  }

  if (isLoading || !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <SwipeToSwitch index={activeIndex} count={tabDefs.length} onIndexChange={switchTab} enabled={!isPrivateLocked && !isBlocked && tabDefs.length > 1}>
        <FlashList
          ref={listRef}
          data={rows}
          keyExtractor={(r) => (r.kind === "header" || r.kind === "tabs" ? r.kind : r.id)}
          getItemType={(r) => r.kind}
          renderItem={renderRow}
          stickyHeaderIndices={rows.findIndex((r) => r.kind === "tabs") >= 0 ? [rows.findIndex((r) => r.kind === "tabs")] : undefined}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
        />
      </SwipeToSwitch>

      {/* Floating actions, above the bottom nav. */}
      <View pointerEvents="box-none" className="absolute right-4 items-end gap-3" style={{ bottom: bottomInset - 8 }}>
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
        {showScrollTop ? (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
            <Pressable
              onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
              accessibilityRole="button"
              accessibilityLabel="Scroll to top"
              className="h-11 w-11 items-center justify-center rounded-full border border-border bg-canvas"
              style={{ elevation: 6 }}
            >
              <Icon as={ArrowUp} size={18} className="text-ink" />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      {ownerMenuOpen ? <DropdownMenu anchorRef={ownerMenuButtonRef} onClose={() => setOwnerMenuOpen(false)} width={256} items={ownerMenuItems} bottomInset={bottomInset} /> : null}

      {relationshipMenuOpen ? (
        <DropdownMenu
          anchorRef={relationshipMenuButtonRef}
          onClose={() => setRelationshipMenuOpen(false)}
          width={224}
          items={[
            { key: "message", label: "Message", icon: <Icon as={Send} size={22} className="text-overlay-ink" />, disabled: startConversation.isPending, onSelect: () => void handleMessage() },
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
