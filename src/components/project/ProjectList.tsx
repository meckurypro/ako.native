// src/components/project/ProjectList.tsx
// Virtualized column of full ProjectCards for hub panes (Saved / Liked). Brings its own scrolling.
import { FlashList } from "@shopify/flash-list";
import type { ReactNode } from "react";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { Text } from "@/components/ui/Text";
import type { Project } from "@/hooks/useProjects";
import { ProjectCard } from "./ProjectCard";

interface ProjectListProps {
  projects: Project[] | undefined;
  isLoading: boolean;
  emptyMessage: string;
  header?: ReactNode;
}

export function ProjectList({ projects, isLoading, emptyMessage, header }: ProjectListProps) {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();

  if (isLoading) return <Text className="py-10 text-center text-ink-muted">Loading…</Text>;
  if (!projects || projects.length === 0) return <Text className="px-4 py-10 text-center text-sm text-ink-muted">{emptyMessage}</Text>;

  return (
    <FlashList
      data={projects}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProjectCard project={item} />}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header as React.ReactElement | null | undefined}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
    />
  );
}
