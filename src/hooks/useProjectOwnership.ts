// src/hooks/useProjectOwnership.ts
//
// "Is this project mine to manage right now?" — answered against the identity
// the person is ACTING AS, not just their login.
//
// A person and the Pages they run share one auth user. projects.owner_id is
// always that user (even for a Page's project — it records who created it, for
// accountability and edit rights), and a Page's project is marked by
// posted_as_page_id. So `owner_id === user.id` alone is true for BOTH the
// person's own projects and every Page project they created, which meant a
// project made personally showed up as "own" (with edit/manage controls) the
// moment the person switched to a Page.
//
// Rule:
//   - Acting as a Page: a project is the Page's own only if it was posted as
//     THAT Page (and the viewer is the user who created it — the server's edit
//     rights follow owner_id). Anything else, including the person's own
//     personal projects, is just another user's content to the Page.
//   - Acting personally: unchanged — owner_id === user.id.
import { useAuth } from "./useAuth";
import { useActiveIdentity } from "./usePages";

type OwnableProject = { owner_id: string; posted_as_page_id?: string | null };

export function isProjectOwnedByIdentity(
  project: OwnableProject | null | undefined,
  userId: string | undefined,
  actingAsPageId: string | null | undefined
): boolean {
  if (!project || !userId) return false;
  if (project.owner_id !== userId) return false;
  if (actingAsPageId) return project.posted_as_page_id === actingAsPageId;
  return true;
}

export function useProjectOwnership() {
  const { user } = useAuth();
  const identityQuery = useActiveIdentity();
  const identity = identityQuery.data;
  const actingAsPageId = identity?.mode === "page" ? identity.page.id : null;
  // Signed in but the acting identity hasn't resolved yet: can't tell personal
  // from page. Report "not owner" (never grant manage controls on a guess) and
  // expose `loading` so edit/guard screens can wait instead of flashing a
  // "not allowed" state.
  const loading = !!user && identityQuery.isLoading;

  return {
    loading,
    actingAsPageId,
    isOwner: (project: OwnableProject | null | undefined) =>
      !loading && isProjectOwnedByIdentity(project, user?.id, actingAsPageId),
  };
}
