// src/hooks/useCanCreateGroup.ts
//
// Who may start a group (a community or a cohort)? Only verified accounts that aren't restricted — admins always
// can. UX layer only: the enforcement is the trg_enforce_group_creator_verified trigger on projects, so a bypassed
// client still can't create one.
import { useIsRestricted } from "./useAccountAccess";
import { useIsAdmin } from "./useAdmin";
import { useFeatureFlag } from "./useFeatureFlags";
import { useMyProfile } from "./useProfile";

export function useCanCreateGroup(): { allowed: boolean; loading: boolean } {
  const projectsEnabled = useFeatureFlag("projects_enabled");
  const restricted = useIsRestricted();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const loading = profileLoading || adminLoading;
  const allowed = projectsEnabled && (!!isAdmin || (!!profile?.is_verified && !restricted));
  return { allowed, loading };
}
