// src/components/project/ProjectCardList.tsx
// Full project cards stacked in a column (profile / Page project tabs).
import { View } from "react-native";

import type { Project } from "@/hooks/useProjects";
import { ProjectCard } from "./ProjectCard";

export function ProjectCardList({ projects, isOwnerView }: { projects: Project[]; isOwnerView?: boolean }) {
  return (
    <View>
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} isOwnerView={isOwnerView} />
      ))}
    </View>
  );
}
