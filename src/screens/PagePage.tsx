// src/screens/PagePage.tsx
// A Page (Organisation / Brand / Product) as a landing view: banner, identity, hero slideshow, about, the team
// members its admins chose to show, subsidiaries, then Projects / Posts tabs. One scrolling list, like the profile.
import {
  ArrowLeft,
  ArrowLeftRight,
  Building2,
  Eye,
  Images,
  LayoutTemplate,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Redo2,
  Share2,
  UserCog,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Share, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { PageHero } from "@/components/page/PageHero";
import { PageTemplateLayout } from "@/components/page/PageTemplateLayout";
import { getPageTemplate, resolveTemplateConfig, type ActionsMode } from "@/lib/pageTemplates";
import { PageTeamShowcase } from "@/components/page/PageTeamShowcase";
import { PostCard } from "@/components/post/PostCard";
import { ProjectCardList } from "@/components/project/ProjectCardList";
import { Avatar } from "@/components/ui/Avatar";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SlidingTabBar } from "@/components/ui/SlidingTabBar";
import { Icon, Image } from "@/components/ui/styled";
import { SwipeToSwitch } from "@/components/ui/SwipeToSwitch";
import { Text } from "@/components/ui/Text";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useAuth } from "@/hooks/useAuth";
import { useIsRestricted } from "@/hooks/useAccountAccess";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import {
  useActiveIdentity,
  useIsFollowingPage,
  useMyPagePermissions,
  useMyPages,
  usePageById,
  usePageByUsername,
  usePageSubsidiaries,
  useSwitchActiveMode,
  useTogglePageFollow,
} from "@/hooks/usePages";
import { usePageFeaturedMembers, usePageHeroSlides, useHeroAspect, BANNER_ASPECT } from "@/hooks/usePageLanding";
import { usePagePosts } from "@/hooks/usePosts";
import { useMyProfile } from "@/hooks/useProfile";
import { usePageProjects } from "@/hooks/useProjects";
import { useTabState } from "@/hooks/useTabState";
import { useSmartBack } from "@/hooks/useSmartBack";
import { APP_URL } from "@/lib/config";
import { OfflineUnavailable } from "@/components/project/OfflineUnavailable";
import { useIsOnline } from "@/hooks/useIsOnline";
import { haptics } from "@/lib/haptics";
import { pageModeLabel } from "@/lib/pageRoles";
import { openExternal } from "@/lib/openExternal";

type Row = { kind: "header" } | { kind: "tabs" } | { kind: "post"; id: string; post: any } | { kind: "projects"; id: string } | { kind: "message"; id: string; text: string };

// Projects (what the page offers) first, then its posts.
const ALL_TABS = ["projects", "posts"] as const;
const RESTRICTED_TABS = ["projects"] as const;
const TAB_LABEL = { projects: "Projects", posts: "Posts" } as const;

const GLASS = { backgroundColor: "rgba(0,0,0,0.35)" } as const;

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

function GlassButton({ icon, label, onPress }: { icon: typeof Plus; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} className="h-10 w-10 items-center justify-center rounded-full" style={GLASS}>
      <Icon as={icon} size={22} className="text-white" />
    </Pressable>
  );
}

export function PagePage() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const bottomInset = useBottomNavInset();
  const chromeScroll = useChromeScroll();
  const insets = useSafeAreaInsets();
  const smartBack = useSmartBack();

  const [menuOpen, setMenuOpen] = useState(false);
  const [nameMenuOpen, setNameMenuOpen] = useState(false);
  const [previewingAsVisitor, setPreviewingAsVisitor] = useState(false);
  // While a finger is on the hero / team strip, the page's own swipe-between-tabs steps aside.
  const [swipeLocked, setSwipeLocked] = useState(false);
  const menuButtonRef = useRef<View>(null);
  const nameButtonRef = useRef<View>(null);

  const { user } = useAuth();
  const restricted = useIsRestricted();
  const { data: me } = useMyProfile();
  const { data: page, isLoading } = usePageByUsername(username ?? "");
  const online = useIsOnline();
  const { data: posts } = usePagePosts(restricted ? "" : page?.id ?? "");
  const { data: projects, isLoading: projectsLoading } = usePageProjects(page?.id);
  // Restricted (consumer-only) accounts see a Page's projects only — never its posts.
  const TABS: readonly (typeof ALL_TABS)[number][] = restricted ? RESTRICTED_TABS : ALL_TABS;
  const [activeTab, setActiveTab] = useTabState<(typeof ALL_TABS)[number]>(TABS, "projects");
  const activeIndex = Math.max(TABS.indexOf(activeTab), 0);

  // Switching Projects / Posts swaps the list's rows; keep the page exactly where the person had scrolled to
  // instead of letting the list jump (it only clamps if the new tab is genuinely shorter).
  const scrollYRef = useRef(0);
  const keepScrollY = useRef<number | null>(null);
  const onListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = e.nativeEvent.contentOffset.y;
      chromeScroll(e);
    },
    [chromeScroll]
  );
  function switchTab(next: (typeof ALL_TABS)[number]) {
    if (next === activeTab) return;
    keepScrollY.current = scrollYRef.current;
    setActiveTab(next);
  }
  useLayoutEffect(() => {
    const y = keepScrollY.current;
    if (y === null) return;
    keepScrollY.current = null;
    const restore = () => chromeScroll.listRef.current?.scrollToOffset?.({ offset: y, animated: false });
    restore();
    requestAnimationFrame(restore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  const { data: myPages } = useMyPages();
  const { data: identity } = useActiveIdentity();
  const switchMode = useSwitchActiveMode();
  const isFollowingQuery = useIsFollowingPage(page?.id ?? "");
  const toggleFollow = useTogglePageFollow(page?.id ?? "");
  const { data: parentPage } = usePageById(page?.parent_organization_id ?? "", !!page?.parent_organization_id);
  const { data: subsidiaries } = usePageSubsidiaries(page?.id);
  const subsidiariesEnabled = useFeatureFlag("subsidiaries_enabled");
  const { data: slides } = usePageHeroSlides(page?.id);
  const heroAspect = useHeroAspect(slides);
  // Only the members an admin chose to show — a visitor's page load never fetches the full roster.
  const { data: featured } = usePageFeaturedMembers(page?.id);

  const isFollowing = !!isFollowingQuery.data;
  // My own relationship to this page comes from one small query about ME — nothing here needs the whole team list.
  const { data: myPagePerms, isLoading: permsLoading } = useMyPagePermissions(page?.id);
  const isMember = !!myPagePerms?.isMember;
  const isAdmin = !!myPagePerms?.isAdmin;
  // Admins can always edit; other members only if an admin granted "edit page details".
  const canEditPage = isAdmin || !!myPagePerms?.permissions.edit_page;
  // Editors see the setup hints and shortcuts; "View as visitor" turns them off.
  const editorView = canEditPage && !previewingAsVisitor;
  // Following is something a PERSON does to a page. Never offered to the page's own team (you'd be following
  // yourself), and never while acting as a page — pages don't follow pages.
  const canFollowPage = !isMember && identity?.mode !== "page" && !(!!user && permsLoading);
  // Once you follow, the Follow/Following button is gone entirely — Unfollow lives in "…".
  const showFollowButton = canFollowPage && !isFollowing;

  const isActiveHere = identity?.mode === "page" && identity.page.id === page?.id;
  const switchablePages = (myPages ?? []).filter((p) => p.id !== page?.id);
  const canSwitchByName = isMember && switchablePages.length > 0;

  function handleSwitchTo(pageId: string | null, destination: string) {
    switchMode.mutate(pageId, { onSuccess: () => router.replace(destination as Href) });
  }

  async function sharePage() {
    if (!page) return;
    const url = `${APP_URL}/page/${page.username}`;
    try {
      await Share.share({ message: url, url, title: page.name });
    } catch {
      /* dismissed */
    }
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [{ kind: "header" }, { kind: "tabs" }];
    if (activeTab === "posts") {
      if (!posts || posts.length === 0) out.push({ kind: "message", id: "no-posts", text: `${page?.name ?? "This page"} hasn't posted anything yet.` });
      else for (const post of posts as any[]) out.push({ kind: "post", id: post.id, post });
    } else if (projectsLoading) {
      out.push({ kind: "message", id: "loading", text: "Loading…" });
    } else if (!projects || projects.length === 0) {
      out.push({
        kind: "message",
        id: "no-projects",
        text: isMember ? `No projects yet — switch to ${page?.name} and tap + to publish the first one.` : `${page?.name} hasn't published any projects yet.`,
      });
    } else {
      out.push({ kind: "projects", id: "projects" });
    }
    return out;
  }, [activeTab, posts, projects, projectsLoading, isMember, page?.name]);

  if (!page && !isLoading && !online) return <OfflineUnavailable subject="page" />;

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  if (!page) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="" />
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-ink-muted">This page doesn't exist, or is no longer active.</Text>
        </View>
      </View>
    );
  }

  const hasSlides = (slides?.length ?? 0) > 0;
  const hasFeatured = (featured?.length ?? 0) > 0;
  const cfg = resolveTemplateConfig(getPageTemplate(page.page_template), hasSlides);
  const menuItems: (DropdownMenuItem | "divider")[] = [
    { key: "share", label: `Share ${pageModeLabel(page.page_type).toLowerCase()}`, icon: <Icon as={Redo2} size={22} className="text-overlay-ink" />, onSelect: () => void sharePage() },
    ...(isMember && isActiveHere
      ? [
          {
            key: "switch-personal",
            label: `Switch to ${me?.display_name ?? "personal"}`,
            icon: <Icon as={ArrowLeftRight} size={22} className="text-overlay-ink" />,
            onSelect: () => handleSwitchTo(null, me ? `/profile/${me.username}` : "/feed"),
          } satisfies DropdownMenuItem,
        ]
      : []),
    ...(isMember && !isActiveHere
      ? [
          {
            key: "switch-page",
            label: `Switch to ${page.name}`,
            icon: <Icon as={ArrowLeftRight} size={22} className="text-overlay-ink" />,
            onSelect: () => handleSwitchTo(page.id, `/page/${page.username}`),
          } satisfies DropdownMenuItem,
        ]
      : []),
    ...(canEditPage
      ? [
          { key: "edit", label: "Edit page", icon: <Icon as={Pencil} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/page/${page.username}/edit` as Href) } satisfies DropdownMenuItem,
          { key: "hero", label: hasSlides ? "Hero slides" : "Add hero slides", icon: <Icon as={Images} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/page/${page.username}/edit?section=hero` as Href) } satisfies DropdownMenuItem,
          { key: "template", label: "Change template", icon: <Icon as={LayoutTemplate} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/page/${page.username}/edit?section=template` as Href) } satisfies DropdownMenuItem,
          {
            key: "preview",
            label: previewingAsVisitor ? "Exit visitor view" : "View as visitor",
            icon: <Icon as={Eye} size={22} className="text-overlay-ink" />,
            onSelect: () => setPreviewingAsVisitor((v) => !v),
          } satisfies DropdownMenuItem,
        ]
      : []),
    ...(isAdmin
      ? [{ key: "team", label: hasFeatured ? "Manage team" : "Add team to page", icon: <Icon as={UserCog} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/page/${page.username}/team` as Href) } satisfies DropdownMenuItem]
      : []),
    ...(isAdmin && subsidiariesEnabled && !restricted
      ? [{ key: "subsidiary", label: "Add Subsidiary", icon: <Icon as={Building2} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/pages/new?parent=${page.id}` as Href) } satisfies DropdownMenuItem]
      : []),
    // Following has no button of its own once you follow — this is where it lives. (Deleting a page lives in
    // Edit page → Danger zone, not here.)
    ...(canFollowPage && isFollowing
      ? [
          "divider" as const,
          {
            key: "unfollow",
            label: "Unfollow",
            variant: "danger" as const,
            icon: <Icon as={UserMinus} size={22} className="text-overlay-danger" />,
            onSelect: () => {
              haptics.selection();
              toggleFollow.mutate(true);
            },
          } satisfies DropdownMenuItem,
        ]
      : []),
  ];

  // Follow / Edit / Share, dressed for wherever the template puts them (on the image, stacked, as text…).
  const renderActions = (tone: "normal" | "overlay", layout: ActionsMode) => {
    const overlay = tone === "overlay";
    const text = layout === "text";
    const stack = layout === "stack";
    const row = layout === "row";
    const fill = stack ? "self-stretch justify-center" : row ? "flex-1 justify-center" : "";
    const followBox = text ? "flex-row items-center gap-1.5" : overlay ? `h-11 flex-row items-center gap-2 rounded-full bg-white px-6 active:opacity-80 ${fill}` : `h-11 flex-row items-center gap-2 rounded-full bg-cta px-6 active:opacity-80 ${fill}`;
    const followText = text ? "text-[15px] font-semibold text-accent" : overlay ? "text-[15px] font-semibold text-black" : "text-[15px] font-semibold text-white";
    const secondBox = text ? "flex-row items-center gap-1.5" : overlay ? `h-11 flex-row items-center gap-2 rounded-full px-5 active:opacity-80 ${fill}` : `h-11 flex-row items-center gap-2 rounded-full border border-border bg-surface px-5 active:opacity-80 ${fill}`;
    const secondText = text ? "text-[15px] font-medium text-ink-muted" : overlay ? "text-[15px] font-semibold text-white" : "text-[15px] font-semibold text-ink";
    const secondIcon = overlay ? "text-white" : text ? "text-ink-muted" : "text-ink";
    const overlayGlass = overlay ? { backgroundColor: "rgba(255,255,255,0.22)" } : undefined;
    const labelledShare = text || stack;
    return (
      <View className={`flex-row items-center ${stack ? "flex-col items-stretch gap-2" : text ? "gap-5" : "gap-2"} ${row ? "self-stretch" : ""}`}>
        {showFollowButton ? (
          <Pressable
            onPress={() => {
              if (!user) return router.push(`/login?redirect=/page/${page.username}` as Href);
              haptics.selection();
              toggleFollow.mutate(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Follow ${page.name}`}
            className={followBox}
          >
            <Icon as={UserPlus} size={text ? 16 : 18} className={text ? "text-accent" : overlay ? "text-black" : "text-white"} />
            <Text className={followText}>Follow</Text>
          </Pressable>
        ) : null}
        {editorView ? (
          <Pressable onPress={() => router.push(`/page/${page.username}/edit` as Href)} accessibilityRole="button" accessibilityLabel="Edit page" className={secondBox} style={overlayGlass}>
            <Icon as={Pencil} size={16} className={secondIcon} />
            <Text className={secondText}>Edit page</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void sharePage()}
          accessibilityRole="button"
          accessibilityLabel="Share"
          className={labelledShare ? secondBox : `h-11 w-11 items-center justify-center rounded-full active:opacity-80 ${overlay ? "" : "border border-border bg-surface"}`}
          style={overlayGlass}
        >
          <Icon as={Share2} size={labelledShare ? 16 : 19} className={secondIcon} />
          {labelledShare ? <Text className={secondText}>Share</Text> : null}
        </Pressable>
      </View>
    );
  };

  // Back / create / options. Over an image they float as glass; on a plain top they are ordinary buttons.
  const topControls = (dark: boolean) => {
    const plain = "h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-80";
    const Btn = ({ icon, label, onPress }: { icon: typeof Plus; label: string; onPress: () => void }) =>
      dark ? (
        <GlassButton icon={icon} label={label} onPress={onPress} />
      ) : (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} className={plain}>
          <Icon as={icon} size={22} className="text-ink" />
        </Pressable>
      );
    return (
      <View className="flex-row items-center gap-1 px-3 pb-1 pt-3">
        <Btn icon={ArrowLeft} label="Back" onPress={smartBack} />
        <View className="flex-1" />
        {/* Only while actually ACTING as this page, so "what I create next" matches "who I'm posting as". */}
        {isActiveHere && !restricted ? <Btn icon={Plus} label="Create" onPress={() => router.push("/create")} /> : null}
        <View ref={menuButtonRef} collapsable={false}>
          <Btn icon={MoreHorizontal} label="Page options" onPress={() => setMenuOpen(true)} />
        </View>
      </View>
    );
  };

  const header = (
    <PageTemplateLayout
      page={page}
      cfg={cfg}
      topControls={topControls}
      renderName={(className) => (
        <View ref={nameButtonRef} collapsable={false} className="self-start">
          <Pressable
            onPress={() => canSwitchByName && setNameMenuOpen(true)}
            disabled={!canSwitchByName}
            accessibilityRole={canSwitchByName ? "button" : "text"}
            accessibilityLabel={canSwitchByName ? `${page.name} — switch to another page` : page.name}
          >
            <Text accessibilityRole="header" className={className}>
              {page.name}
            </Text>
          </Pressable>
        </View>
      )}
      renderActions={renderActions}
      verified={page.is_verified ? <VerifiedBadge size={15} label /> : null}
      handleLine={`${pageModeLabel(page.page_type)} · @${page.username}`}
      tagline={page.tagline}
      parentLine={
        parentPage ? (
          <Text className="mt-1.5 text-xs text-ink-muted">
            {"A Subsidiary of "}
            <Text className="font-medium text-accent" accessibilityRole="link" onPress={() => router.push(`/page/${parentPage.username}` as Href)}>
              {parentPage.name}
            </Text>
          </Text>
        ) : null
      }
      followers={
        <Text className="text-sm">
          <Text className="font-bold text-ink">{page.follower_count}</Text>
          <Text className="text-ink-muted">{page.follower_count === 1 ? " follower" : " followers"}</Text>
        </Text>
      }
      website={
        page.website_url ? (
          <Pressable onPress={() => void openExternal(getWebsiteHref(page.website_url!))} accessibilityRole="link" accessibilityLabel={`Website: ${getWebsiteDomain(page.website_url)}`} className="max-w-full flex-row items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5">
            <Icon as={Link2} size={14} className="text-accent" />
            <Text numberOfLines={1} className="shrink text-sm font-medium text-accent">
              {getWebsiteDomain(page.website_url)}
            </Text>
          </Pressable>
        ) : null
      }
      visitorNotice={
        previewingAsVisitor && canEditPage ? (
          <View className="flex-row items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-2.5">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              <Icon as={Eye} size={14} className="text-accent" />
              <Text className="flex-1 text-sm text-accent">You're viewing this page as a visitor.</Text>
            </View>
            <Pressable onPress={() => setPreviewingAsVisitor(false)} accessibilityRole="button" accessibilityLabel="Exit visitor view" hitSlop={8} className="flex-row items-center gap-1">
              <Icon as={X} size={14} className="text-accent" />
              <Text className="text-sm font-medium text-accent">Exit</Text>
            </Pressable>
          </View>
        ) : null
      }
      hero={
        hasSlides ? (
          <PageHero slides={slides!} autoplay={page.hero_autoplay ?? true} intervalSeconds={page.hero_interval_seconds ?? 5} direction={page.hero_direction ?? "forward"} pageName={page.name} aspect={heroAspect} frame={cfg.heroFrame} onTouchLock={setSwipeLocked} />
        ) : null
      }
      team={(heading) => (hasFeatured ? <PageTeamShowcase members={featured!} onTouchLock={setSwipeLocked} heading={heading} /> : null)}
      subsidiaries={
        subsidiaries && subsidiaries.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            onTouchStart={() => setSwipeLocked(true)}
            onTouchEnd={() => setSwipeLocked(false)}
            onTouchCancel={() => setSwipeLocked(false)}
            className="-mx-4 mt-3"
            contentContainerClassName="gap-3 px-4"
          >
            {subsidiaries.map((s) => (
              <Pressable key={s.id} onPress={() => router.push(`/page/${s.username}` as Href)} accessibilityRole="link" className="w-20 shrink-0 items-center gap-1.5">
                <Avatar src={s.avatar_url} name={s.name} size="vn" />
                <Text numberOfLines={1} className="w-full text-center text-xs text-ink-muted">
                  {s.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null
      }
    />
  );

  // The sticky tab bar — same sliding indicator as the profile and Library.
  const tabs = (
    <View className="bg-canvas px-4">
      <SlidingTabBar
        tabs={TABS.map((t) => ({ id: t, label: t === "projects" && projects && projects.length > 0 ? `${TAB_LABEL[t]} · ${projects.length}` : TAB_LABEL[t] }))}
        activeIndex={activeIndex}
        onSelect={(i) => switchTab(TABS[i])}
      />
    </View>
  );

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <SwipeToSwitch index={activeIndex} count={TABS.length} enabled={!swipeLocked} onIndexChange={(i) => switchTab(TABS[i])}>
        <FlashList
          showsHorizontalScrollIndicator={false}
          data={rows}
          keyExtractor={(r) => (r.kind === "header" || r.kind === "tabs" ? r.kind : r.id)}
          getItemType={(r) => r.kind}
          stickyHeaderIndices={[1]}
          ref={chromeScroll.listRef}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: bottomInset }}
          renderItem={({ item }) => {
            switch (item.kind) {
              case "header":
                return header;
              case "tabs":
                return tabs;
              case "post":
                return (
                  <View className="px-5 pt-4">
                    <PostCard post={item.post} />
                  </View>
                );
              case "projects":
                return (
                  <View className="p-4">
                    <ProjectCardList projects={projects ?? []} isOwnerView={isMember && (identity?.mode !== "page" || isActiveHere)} />
                  </View>
                );
              case "message":
                return <Text className="px-6 py-14 text-center text-sm text-ink-muted">{item.text}</Text>;
            }
          }}
        />
      </SwipeToSwitch>

      {menuOpen ? <DropdownMenu title="Page options" anchorRef={menuButtonRef} onClose={() => setMenuOpen(false)} items={menuItems} bottomInset={bottomInset} /> : null}

      {nameMenuOpen ? (
        <DropdownMenu
          title="Switch page"
          anchorRef={nameButtonRef}
          onClose={() => setNameMenuOpen(false)}
          items={switchablePages.map((p) => ({
            key: p.id,
            label: p.name,
            icon: <Avatar src={p.avatar_url} name={p.name} size="sm" />,
            onSelect: () => handleSwitchTo(p.id, `/page/${p.username}`),
          }))}
        />
      ) : null}
    </View>
  );
}
