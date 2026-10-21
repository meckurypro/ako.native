// src/components/project/ProjectRail.tsx
// Titled horizontal shelf of mini project cards.
import { ScrollView, View } from "react-native";

import { ProjectMiniCard } from "@/components/post/ProjectMiniCard";
import { Text } from "@/components/ui/Text";
import type { Project } from "@/hooks/useProjects";

const RAIL_CARD_WIDTH = 144; // w-36, same as the web rail
const RAIL_GAP = 12; // gap-3

export function ProjectRail({ title, projects }: { title: string; projects: Project[] }) {
  if (projects.length === 0) return null;
  return (
    <View className="mt-8">
      <Text className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">{title}</Text>
      {/* Bleeds to the screen edges so the shelf scrolls off-screen naturally. */}
      {/* One horizontal swipe shelf — never a stacked list. Fixed card width + snapping, card to card. */}
      <ScrollView showsVerticalScrollIndicator={false}
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        decelerationRate="fast"
        snapToInterval={RAIL_CARD_WIDTH + RAIL_GAP}
        snapToAlignment="start"
        className="-mx-4"
        contentContainerClassName="gap-3 px-4 pb-1"
      >
        {projects.map((p) => (
          <ProjectMiniCard key={p.id} project={p} width={RAIL_CARD_WIDTH} />
        ))}
      </ScrollView>
    </View>
  );
}
