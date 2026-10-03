// src/components/post/SearchResults.tsx
// Tabbed search results (All · People · Pages · Posts · Projects). "All" shows a
// short preview of each non-empty group with "See all"; each tab shows the full
// group. Render inside a ScrollView — it is not virtualized (result sets are
// capped server-side).
import { Search as SearchIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Skeleton } from "@/components/ui/Skeleton";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useSearchPages, useSearchPeople, useSearchPosts, useSearchProjects } from "@/hooks/useSearch";
import { useTabState } from "@/hooks/useTabState";
import { recordSearchVisit } from "@/lib/searchVisits";
import { PageRow } from "./PageRow";
import { PersonRow } from "./PersonRow";
import { PostCard } from "./PostCard";
import { ProjectMiniGrid } from "./ProjectMiniCard";

const TABS = ["all", "people", "pages", "posts", "projects"] as const;
export type SearchTab = (typeof TABS)[number];

const TAB_LABELS: Record<SearchTab, string> = {
  all: "All",
  people: "People",
  pages: "Pages",
  posts: "Posts",
  projects: "Projects",
};

const PREVIEW_COUNT = 3;

/** Searching starts at 2 characters (matches the server's minimum). */
export const MIN_QUERY_LENGTH = 2;

export function isSearchable(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

export function useSearchTab() {
  return useTabState<SearchTab>(TABS, "all");
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3 border-b border-border py-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3 w-1/3 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState({ label, hint }: { label: string; hint?: string }) {
  return (
    <View className="items-center px-6 py-14">
      <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
        <Icon as={SearchIcon} size={22} className="text-accent" />
      </View>
      <Text className="text-center text-sm font-medium text-ink">{label}</Text>
      {hint ? <Text className="mt-1 text-center text-sm text-ink-muted">{hint}</Text> : null}
    </View>
  );
}

function ErrorState({ what }: { what: string }) {
  return (
    <Text accessibilityRole="alert" className="py-10 text-center text-sm text-ink-muted">
      Couldn't load {what}. Check your connection and try again.
    </Text>
  );
}

function Section({ title, onSeeAll, showSeeAll, children }: { title: string; onSeeAll: () => void; showSeeAll: boolean; children: ReactNode }) {
  return (
    <View className="mb-6">
      <View className="mb-1 flex-row items-baseline justify-between">
        <Text className="font-display text-base text-ink">{title}</Text>
        {showSeeAll ? (
          <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8}>
            <Text className="text-sm font-medium text-accent">See all</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function SearchResults({ query, isPending = false }: { query: string; isPending?: boolean }) {
  const { user } = useAuth();
  const [tab, setTab] = useSearchTab();

  // All four run for every tab so "All" can preview them and switching tabs is instant.
  const people = useSearchPeople(query);
  const pages = useSearchPages(query);
  const posts = useSearchPosts(query);
  const projects = useSearchProjects(query);

  const onVisit = (profileId: string) => recordSearchVisit(user?.id, profileId);
  const loading = (q: { isLoading: boolean }) => q.isLoading || isPending;

  function renderPeople(limit?: number) {
    if (loading(people)) return <SkeletonRows />;
    if (people.isError) return <ErrorState what="people" />;
    const rows = (people.data ?? []).slice(0, limit);
    if (rows.length === 0) return limit ? null : <EmptyState label="No people found" hint="Try a name or @username." />;
    return (
      <View>
        {rows.map((p) => (
          <View key={p.id} className="border-b border-border">
            <PersonRow profile={p} onVisit={onVisit} />
          </View>
        ))}
      </View>
    );
  }

  function renderPages(limit?: number) {
    if (loading(pages)) return <SkeletonRows />;
    if (pages.isError) return <ErrorState what="pages" />;
    const rows = (pages.data ?? []).slice(0, limit);
    if (rows.length === 0) return limit ? null : <EmptyState label="No pages found" hint="Try a page name, @username or tagline." />;
    return (
      <View>
        {rows.map((p) => (
          <View key={p.id} className="border-b border-border">
            <PageRow page={p} />
          </View>
        ))}
      </View>
    );
  }

  function renderPosts(limit?: number) {
    if (loading(posts)) return <SkeletonRows />;
    if (posts.isError) return <ErrorState what="posts" />;
    const rows = (posts.data ?? []).slice(0, limit);
    if (rows.length === 0) return limit ? null : <EmptyState label="No posts found" hint="Try different keywords." />;
    return (
      <>
        {rows.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </>
    );
  }

  function renderProjects(limit?: number) {
    if (loading(projects)) return <SkeletonRows />;
    if (projects.isError) return <ErrorState what="projects" />;
    const rows = (projects.data ?? []).slice(0, limit);
    if (rows.length === 0) return limit ? null : <EmptyState label="No projects found" hint="Try a title or keyword." />;
    return <ProjectMiniGrid projects={rows} />;
  }

  const settled = !isPending && ![people, pages, posts, projects].some((q) => q.isLoading);
  const allEmpty = settled && [people, pages, posts, projects].every((q) => !q.isError && (q.data ?? []).length === 0);

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        className="mb-4 border-b border-border"
        contentContainerClassName="gap-5"
      >
        {TABS.map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            className={`-mb-px shrink-0 border-b-2 pb-3 pt-1 ${tab === t ? "border-accent" : "border-transparent"}`}
          >
            <Text className={`text-sm font-medium ${tab === t ? "text-accent" : "text-ink-muted"}`}>{TAB_LABELS[t]}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View>
        {tab === "people" ? renderPeople() : null}
        {tab === "pages" ? renderPages() : null}
        {tab === "posts" ? renderPosts() : null}
        {tab === "projects" ? renderProjects() : null}

        {tab === "all" ? (
          allEmpty ? (
            <EmptyState label={`No results for “${query.trim()}”`} hint="Check the spelling or try a shorter search." />
          ) : (
            <>
              {loading(people) || (people.data?.length ?? 0) > 0 || people.isError ? (
                <Section title="People" showSeeAll={(people.data?.length ?? 0) > PREVIEW_COUNT} onSeeAll={() => setTab("people")}>
                  {renderPeople(PREVIEW_COUNT)}
                </Section>
              ) : null}
              {loading(pages) || (pages.data?.length ?? 0) > 0 || pages.isError ? (
                <Section title="Pages" showSeeAll={(pages.data?.length ?? 0) > PREVIEW_COUNT} onSeeAll={() => setTab("pages")}>
                  {renderPages(PREVIEW_COUNT)}
                </Section>
              ) : null}
              {loading(projects) || (projects.data?.length ?? 0) > 0 || projects.isError ? (
                <Section title="Projects" showSeeAll={(projects.data?.length ?? 0) > PREVIEW_COUNT} onSeeAll={() => setTab("projects")}>
                  {renderProjects(PREVIEW_COUNT)}
                </Section>
              ) : null}
              {loading(posts) || (posts.data?.length ?? 0) > 0 || posts.isError ? (
                <Section title="Posts" showSeeAll={(posts.data?.length ?? 0) > PREVIEW_COUNT} onSeeAll={() => setTab("posts")}>
                  {renderPosts(PREVIEW_COUNT)}
                </Section>
              ) : null}
            </>
          )
        ) : null}
      </View>
    </View>
  );
}
