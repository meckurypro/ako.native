// src/screens/SavedHub.tsx
// Saved: bookmarked posts and saved projects. (/bookmarks and /saved-projects redirect here.)
import { PostsProjectsHub } from "@/components/activity/PostsProjectsHub";
import { useBookmarkedPosts } from "@/hooks/useBookmarks";
import { useSavedProjects } from "@/hooks/useSavedProjects";

export function SavedHub() {
  const { data: posts, isLoading: postsLoading } = useBookmarkedPosts();
  const { data: projects, isLoading: projectsLoading } = useSavedProjects();

  return (
    <PostsProjectsHub
      title="Saved"
      posts={posts}
      postsLoading={postsLoading}
      postsEmpty="Nothing saved yet. Tap the bookmark icon on a post to keep it here."
      projects={projects}
      projectsLoading={projectsLoading}
      projectsEmpty="Nothing saved yet. Tap the bookmark icon on a project to keep it here."
    />
  );
}
