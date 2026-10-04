// src/screens/PagePage.tsx
// A Page (Organisation / Brand / Product): identity, follow, team strip,
// subsidiaries, and Posts / Projects tabs. One scrolling list, like the profile.
import {
  ArrowLeftRight,
  Building2,
  Globe,
  MoreHorizontal,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  UserCog,
  Users,
} from "lucide-react-native";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Share, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { PostCard } from "@/components/post/PostCard";
import { ProjectMiniGrid } from "@/components/post/ProjectMiniCard";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { SwipeToSwitch } from "@/components/ui/SwipeToSwitch";
import { Text } from "@/components/ui/Text";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import {
  useActiveIdentity,
  useDeletePage,
  useIsFollowingPage,
  useMyPages,
  usePageById,
  usePageByUsername,
  usePageMembers,
  usePageSubsidiaries,
  useResolvePageOwner,
  useSwitchActiveMode,
  useTogglePageFollow,
} from "@/hooks/usePages";
import { usePagePosts } from "@/hooks/usePosts";
import { useMyProfile } from "@/hooks/useProfile";
import { usePageProjects } from "@/hooks/useProjects";
import { useTabState } from "@/hooks/useTabState";
import { APP_URL } from "@/lib/config";
import { haptics } from "@/lib/haptics";
import { pageModeLabel } from "@/lib/pageRoles";

type Row = { kind: "header" } | { kind: "tabs" } | { kind: "post"; id: string; post: any } | { kind: "projects"; id: string } | { kind: "message"; id: string; text: string };

const TABS = ["posts", "projects"] as const;

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

function StripAvatar({ src, name, label, onPress }: { src: string | null; name: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" className="w-16 shrink-0 items-center gap-1">
      <Avatar src={src} name={name} size="md" />
      <Text numberOfLines={1} className="w-full text-center text-[11px] text-ink-muted">
        {label}
      </Text>
    </Pressable>
  );
}

export function PagePage() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const bottomInset = useBottomNavInset();
  const chromeScroll = useChromeScroll();

  const [menuOpen, setMenuOpen] = useState(false);
  const [nameMenuOpen, setNameMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const menuButtonRef = useRef<View>(null);
  const nameButtonRef = useRef<View>(null);

  const { user } = useAuth();
  const { data: me } = useMyProfile();
  const { data: page, isLoading } = usePageByUsername(username ?? "");
  const { data: members } = usePageMembers(page?.id ?? "");
  const { data: posts } = usePagePosts(page?.id ?? "");
  const { data: projects, isLoading: projectsLoading } = usePageProjects(page?.id);
  const [activeTab, setActiveTab] = useTabState<(typeof TABS)[number]>(TABS, "posts");
  const activeIndex = TABS.indexOf(activeTab);
  const { data: myPages } = useMyPages();
  const { data: identity } = useActiveIdentity();
  const switchMode = useSwitchActiveMode();
  const isFollowingQuery = useIsFollowingPage(page?.id ?? "");
  const toggleFollow = useTogglePageFollow(page?.id ?? "");
  const { data: parentPage } = usePageById(page?.parent_organization_id ?? "", !!page?.parent_organization_id);
  const { data: subsidiaries } = usePageSubsidiaries(page?.id);
  const subsidiariesEnabled = useFeatureFlag("subsidiaries_enabled");
  const deletePage = useDeletePage();

  const isFollowing = !!isFollowingQuery.data;
  const myMembership = members?.find((m) => m.user_id === user?.id && m.status === "active");
  const isMember = !!myMembership;
  const isAdmin = !!myMembership?.is_admin;
  const { data: pageOwnerId } = useResolvePageOwner(page?.id ?? "", isAdmin);
  const isOwnerOfPage = isAdmin && !!user && pageOwnerId === user.id;
  const activeMembers = (members ?? []).filter((m) => m.status === "active");

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
    ...(isAdmin
      ? [
          { key: "edit", label: "Edit page", icon: <Icon as={Pencil} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/page/${page.username}/edit` as Href) } satisfies DropdownMenuItem,
          { key: "team", label: "Manage team", icon: <Icon as={UserCog} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/page/${page.username}/team` as Href) } satisfies DropdownMenuItem,
        ]
      : []),
    ...(isAdmin && subsidiariesEnabled
      ? [{ key: "subsidiary", label: "Add Subsidiary", icon: <Icon as={Building2} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/pages/new?parent=${page.id}` as Href) } satisfies DropdownMenuItem]
      : []),
    // Only the resolved owner sees this at all (creator, or the longest-standing admin if the creator is gone).
    ...(isAdmin && isOwnerOfPage
      ? [{ key: "delete", label: "Delete page", variant: "danger" as const, icon: <Icon as={Trash2} size={22} className="text-overlay-danger" />, onSelect: () => setShowDeleteConfirm(true) } satisfies DropdownMenuItem]
      : []),
  ];

  const header = (
    <View className="bg-canvas">
      <ScreenHeader
        title=""
        right={
          <View className="flex-row items-center gap-1">
            {/* Only while actually ACTING as this page, so "what I create next" matches "who I'm posting as". */}
            {isActiveHere ? (
              <Pressable onPress={() => router.push("/create")} accessibilityRole="button" accessibilityLabel="Create" hitSlop={8} className="p-2">
                <Icon as={Plus} size={22} className="text-ink-muted" />
              </Pressable>
            ) : null}
            <View ref={menuButtonRef} collapsable={false}>
              <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Page options" hitSlop={8} className="p-2">
                <Icon as={MoreHorizontal} size={20} className="text-ink-muted" />
              </Pressable>
            </View>
          </View>
        }
      />

      <View className="px-4 pb-4 pt-1">
        <View className="flex-row items-start gap-4">
          <Avatar src={page.avatar_url} name={page.name} size="xl" />
          <View className="min-w-0 flex-1 pt-1">
            <View ref={nameButtonRef} collapsable={false} className="self-start">
              <Pressable
                onPress={() => canSwitchByName && setNameMenuOpen(true)}
                disabled={!canSwitchByName}
                accessibilityRole={canSwitchByName ? "button" : "text"}
                accessibilityLabel={canSwitchByName ? `${page.name} — switch to another page` : page.name}
              >
                <Text numberOfLines={1} className="font-display text-lg text-ink">
                  {page.name}
                </Text>
              </Pressable>
            </View>
            {page.is_verified ? <VerifiedBadge size={15} label className="mt-1" /> : null}
            <Text className="mt-1 text-xs text-ink-muted">
              {pageModeLabel(page.page_type)} · @{page.username}
            </Text>
            {page.tagline ? <Text className="mt-1 text-sm text-ink">{page.tagline}</Text> : null}
            {parentPage ? (
              <Text className="mt-1 text-xs text-ink-muted">
                {"A Subsidiary of "}
                <Text className="font-medium text-accent" accessibilityRole="link" onPress={() => router.push(`/page/${parentPage.username}` as Href)}>
                  {parentPage.name}
                </Text>
              </Text>
            ) : null}
          </View>
        </View>

        {page.bio ? <Text className="mt-3 text-sm text-ink">{page.bio}</Text> : null}

        {page.website_url ? (
          <Pressable onPress={() => void Linking.openURL(getWebsiteHref(page.website_url!))} accessibilityRole="link" className="mt-2 flex-row items-center gap-1.5 self-start">
            <Icon as={Globe} size={14} className="text-accent" />
            <Text className="text-sm text-accent">{getWebsiteDomain(page.website_url)}</Text>
          </Pressable>
        ) : null}

        <View className="mt-3 flex-row items-center gap-4">
          <Text className="text-sm">
            <Text className="font-bold text-ink">{page.follower_count}</Text>
            <Text className="text-ink-muted"> followers</Text>
          </Text>
          <Pressable onPress={() => router.push(`/page/${page.username}/team` as Href)} accessibilityRole="link" className="flex-row items-center gap-1">
            <Icon as={Users} size={14} className="text-ink-muted" />
            <Text className="text-sm text-ink-muted">{activeMembers.length} on the team</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            if (!user) return router.push(`/login?redirect=/page/${page.username}` as Href);
            haptics.selection();
            toggleFollow.mutate(isFollowing);
          }}
          disabled={toggleFollow.isPending}
          accessibilityRole="button"
          className={`mt-4 w-full items-center rounded-xl py-2.5 ${isFollowing ? "bg-surface" : "bg-accent"} ${toggleFollow.isPending ? "opacity-60" : ""}`}
        >
          <Text className={`text-sm font-medium ${isFollowing ? "text-ink" : "text-canvas"}`}>{isFollowing ? "Following" : "Follow"}</Text>
        </Pressable>

        {activeMembers.length > 0 ? (
          <View className="mt-5">
            <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Team</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
              {activeMembers.slice(0, 8).map((m) => (
                <StripAvatar key={m.id} src={m.profile.avatar_url} name={m.profile.display_name} label={m.role_label} onPress={() => router.push(`/profile/${m.profile.username}` as Href)} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {subsidiaries && subsidiaries.length > 0 ? (
          <View className="mt-5">
            <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Subsidiaries</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
              {subsidiaries.map((s) => (
                <StripAvatar key={s.id} src={s.avatar_url} name={s.name} label={s.name} onPress={() => router.push(`/page/${s.username}` as Href)} />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );

  const tabs = (
    <View accessibilityRole="tablist" className="flex-row gap-6 border-t border-border bg-canvas px-4">
      {TABS.map((t) => (
        <Pressable
          key={t}
          onPress={() => setActiveTab(t)}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === t }}
          className={`-mb-px border-b-2 py-3 ${activeTab === t ? "border-accent" : "border-transparent"}`}
        >
          <Text className={`text-sm font-medium ${activeTab === t ? "text-accent" : "text-ink-muted"}`}>
            {t === "posts" ? "Posts" : "Projects"}
            {t === "projects" && projects && projects.length > 0 ? <Text className="text-xs font-normal text-ink-muted">{`  ${projects.length}`}</Text> : null}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View className="flex-1 bg-canvas">
      <SwipeToSwitch index={activeIndex} count={TABS.length} onIndexChange={(i) => setActiveTab(TABS[i])}>
        <FlashList
          data={rows}
          keyExtractor={(r) => (r.kind === "header" || r.kind === "tabs" ? r.kind : r.id)}
          getItemType={(r) => r.kind}
          stickyHeaderIndices={[1]}
          onScroll={chromeScroll}
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
                    <ProjectMiniGrid projects={projects ?? []} showStatus={isMember} />
                  </View>
                );
              case "message":
                return <Text className="px-6 py-14 text-center text-sm text-ink-muted">{item.text}</Text>;
            }
          }}
        />
      </SwipeToSwitch>

      {menuOpen ? <DropdownMenu anchorRef={menuButtonRef} onClose={() => setMenuOpen(false)} width={240} items={menuItems} bottomInset={bottomInset} /> : null}

      {nameMenuOpen ? (
        <DropdownMenu
          anchorRef={nameButtonRef}
          onClose={() => setNameMenuOpen(false)}
          width={224}
          items={switchablePages.map((p) => ({
            key: p.id,
            label: p.name,
            icon: <Avatar src={p.avatar_url} name={p.name} size="sm" />,
            onSelect: () => handleSwitchTo(p.id, `/page/${p.username}`),
          }))}
        />
      ) : null}

      {showDeleteConfirm ? (
        <ConfirmDialog
          title="Delete this page?"
          description={`${page.name} will disappear from search and everyone's feed. This can't be undone from here.`}
          confirmLabel="Delete"
          onConfirm={() => {
            deletePage.mutate(page.id, { onSuccess: () => router.replace("/pages") });
            setShowDeleteConfirm(false);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      ) : null}
    </View>
  );
}
