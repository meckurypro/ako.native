// src/lib/pageRoles.ts
// Shared helpers for "account mode" — organisation/brand pages and
// the role-based membership that lets a personal account act as one.
// Mirrors the shape of lib/profileRoles.ts on purpose: same idea
// (join + flatten for display), different table.
import type { PageAffiliation, PageMemberStatus } from "../types/database";

// Selects everything needed to render a page's "pages I manage" row
// or an affiliation chip, joined through page_members.
export const PAGE_WITH_MEMBERSHIP_SELECT =
  "role_label, is_admin, page:pages(id, page_type, name, username, tagline, bio, avatar_url, cover_url, website_url, category_id, parent_organization_id, created_by, is_verified, is_active, follower_count, created_at, updated_at)";

export const PAGE_AFFILIATION_SELECT = "role_label, page:pages(id, username, name)";

export function toPageAffiliations(rows: any[] | null | undefined): PageAffiliation[] {
  if (!rows) return [];
  return rows
    .filter((r) => r.page)
    .map((r) => ({
      page_id: r.page.id,
      page_username: r.page.username,
      page_name: r.page.name,
      role_label: r.role_label,
    }));
}

export function formatAffiliation(a: Pick<PageAffiliation, "role_label" | "page_name">): string {
  return `${a.role_label} at ${a.page_name}`;
}

export function pageModeLabel(pageType: "organization" | "brand" | "product"): string {
  if (pageType === "organization") return "Organisation";
  if (pageType === "brand") return "Brand";
  return "Product";
}

// Only page admins are allowed to post/manage as the page (mirrors the
// restriction the create-page-post edge function enforces server-side).
export function canActAsAdmin(status: PageMemberStatus, isAdmin: boolean): boolean {
  return status === "active" && isAdmin;
}
