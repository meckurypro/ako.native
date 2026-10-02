// Shared helper so every query that embeds an author's job/hobby tags
// (posts, comments, messages, profile pages, etc.) selects and shapes
// them the same way.
export const PROFILE_ROLES_SELECT = "profile_roles(position, role:roles(id, label))";

export function toProfileRoles(rows: any[] | null | undefined) {
  if (!rows) return [];
  return rows
    .map((r) => ({ role_id: r.role.id, label: r.role.label, position: r.position }))
    .sort((a, b) => a.position - b.position);
}
