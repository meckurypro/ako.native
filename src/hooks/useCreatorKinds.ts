// src/hooks/useCreatorKinds.ts
//
// Admin-controlled "who can create what" matrix (project_type_creator_rules,
// see supabase/ako_project_type_creator_kinds.sql). A *creator kind* is the
// identity a project is created as:
//   restricted    personal account still pending review (consumer-only mode)
//   unrestricted  any other personal account
//   organization / brand / product   a page of that type
// A missing rule means "allowed", mirroring the server trigger
// (enforce_project_type_rules), which is the real enforcement — this is the
// UX layer. Admins and exempted accounts bypass the matrix server-side too.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useIsRestricted } from "./useAccountAccess";
import { useIsAdmin } from "./useAdmin";
import { useActiveIdentity } from "./usePages";
import {
  getAllowedProjectTypes,
  useActiveProjectTypes,
  useMyProjectTypeExemption,
  type ProjectType,
} from "./useProjects";

export type CreatorKind = "restricted" | "unrestricted" | "organization" | "brand" | "product";

export const CREATOR_KINDS: CreatorKind[] = ["restricted", "unrestricted", "organization", "brand", "product"];

export const CREATOR_KIND_LABELS: Record<CreatorKind, string> = {
  restricted: "Restricted",
  unrestricted: "Unrestricted",
  organization: "Organization pages",
  brand: "Brand pages",
  product: "Product pages",
};

export const CREATOR_KIND_HINTS: Record<CreatorKind, string> = {
  restricted: "Personal accounts still under review",
  unrestricted: "Approved personal accounts",
  organization: "Projects posted as an organization page",
  brand: "Projects posted as a brand page",
  product: "Projects posted as a product page",
};

export interface CreatorRule {
  project_type: ProjectType;
  creator_kind: CreatorKind;
  allowed: boolean;
}

export function useCreatorRules() {
  return useQuery({
    queryKey: ["project-type-creator-rules"],
    queryFn: async (): Promise<CreatorRule[]> => {
      const { data, error } = await supabase
        .from("project_type_creator_rules")
        .select("project_type, creator_kind, allowed");
      if (error) throw error;
      return (data ?? []) as CreatorRule[];
    },
    staleTime: 60_000,
  });
}

/** Missing rule → allowed, same as the server. */
export function isTypeAllowedForKind(
  rules: CreatorRule[] | undefined,
  type: ProjectType,
  kind: CreatorKind | undefined
): boolean {
  if (!rules || !kind) return true; // unknown yet — don't hide prematurely
  const rule = rules.find((r) => r.project_type === type && r.creator_kind === kind);
  return rule ? rule.allowed : true;
}

/** The kind the signed-in user is currently creating as. */
export function useMyCreatorKind(): CreatorKind {
  const restricted = useIsRestricted();
  const { data: identity } = useActiveIdentity();
  if (identity?.mode === "page" && identity.page) {
    return identity.page.page_type as CreatorKind;
  }
  return restricted ? "restricted" : "unrestricted";
}

/** True when the matrix doesn't apply to this account (admin or exempted). */
export function useBypassesCreatorRules(): boolean {
  const { data: isAdmin } = useIsAdmin();
  const { data: isExempt } = useMyProjectTypeExemption();
  return !!isAdmin || !!isExempt;
}

/**
 * Does the matrix leave this identity with at least one project type to
 * create? Used to decide whether a restricted account gets a create entry
 * point at all. Resolves to `false` until the data is in, so restricted
 * accounts never see a create button flash.
 */
export function useCanCreateAnyProject(): boolean {
  const kind = useMyCreatorKind();
  const bypass = useBypassesCreatorRules();
  const { data: rules } = useCreatorRules();
  const { data: typeSettings } = useActiveProjectTypes();
  if (!rules) return false;
  const mode = kind === "restricted" || kind === "unrestricted" ? "personal" : "page";
  return getAllowedProjectTypes(mode).some((type) => {
    const setting = typeSettings?.find((s) => s.project_type === type);
    if (setting && !setting.is_active) return false;
    return bypass || isTypeAllowedForKind(rules, type, kind);
  });
}
