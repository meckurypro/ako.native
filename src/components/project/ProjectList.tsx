// src/components/project/ProjectList.tsx
// Virtualized column of full ProjectCards for hub panes (Saved / Liked). Brings its own scrolling.
import { FlashList } from "@shopify/flash-list";
import type { ReactNode } from "react";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { Text } from "@/components/ui/Text";
import { RefreshSkeleton } from "@/components/ui/RefreshSkeleton";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import type { Project } from "@/hooks/useProjects";
import { ProjectCard } from "./ProjectCard";

interface ProjectListProps {
  projects: Project[] | undefined;
  isLoading: boolean;
  emptyMessage: string;
  header?: ReactNode;
  /** Pull-to-refresh. Omit and the list has no refresh control. */
  onRefresh?: () => Promise<unknown> | void;
}

export function ProjectList({ projects, isLoading, emptyMessage, header, onRefresh }: ProjectListProps) {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { refreshControl, refreshing } = usePullToRefresh(() => onRefresh?.());

  if (isLoading) return <Text className="py-10 text-center text-ink-muted">Loading…</Text>;
  if (!projects || projects.length === 0) return <Text className="px-4 py-10 text-center text-sm text-ink-muted">{emptyMessage}</Text>;

  return (
    <FlashList
      data={refreshing ? [] : projects}
      refreshControl={onRefresh ? refreshControl : undefined}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProjectCard project={item} />}
      ref={onScroll.listRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={(refreshing ? null : header) as React.ReactElement | null | undefined}
      ListEmptyComponent={refreshing ? <RefreshSkeleton /> : null}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
    />
  );
}
