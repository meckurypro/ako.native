// src/screens/LikedHub.tsx
// Liked: posts and projects you've reacted to with a like.
import { PostsProjectsHub } from "@/components/activity/PostsProjectsHub";
import { useLikedPosts, useLikedProjects } from "@/hooks/useReactions";
import type { Project } from "@/hooks/useProjects";
import type { PostWithAuthor } from "@/types/database";

export function LikedHub() {
  const { data: posts, isLoading: postsLoading } = useLikedPosts();
  const { data: projects, isLoading: projectsLoading } = useLikedProjects();

  return (
    <PostsProjectsHub
      title="Liked"
      posts={posts as PostWithAuthor[] | undefined}
      postsLoading={postsLoading}
      postsEmpty="Posts you like will show up here."
      projects={projects as Project[] | undefined}
      projectsLoading={projectsLoading}
      projectsEmpty="Projects you like will show up here."
    />
  );
}
