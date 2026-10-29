// src/lib/groups.ts
//
// A Group is the one entity for "people gathered around something". Under the hood it is a project of
// project_type 'room' (identifiers stay as they are — renaming tables/policies is cosmetic risk), with a `kind`:
//
//   cohort     structured learning — start/end dates, live sessions, assignments with deadlines, closes when done
//   community  open-ended social space — chat, announcements, meetings; never closes, no assignments
//
// Everything both kinds share (members, chat, polls, meetings, moderation, join rules, privacy) is one code path.
export type GroupKind = "cohort" | "community";
export type GroupRole = "creator" | "host" | "member";

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  cohort: "Cohort",
  community: "Community",
};

export const GROUP_KIND_PLURAL: Record<GroupKind, string> = {
  cohort: "Cohorts",
  community: "Communities",
};

export const GROUP_KIND_BLURB: Record<GroupKind, string> = {
  cohort: "Structured learning. A start and end date, live sessions, assignments with deadlines, and a classroom.",
  community: "An open-ended space for people with something in common to talk, share and stay updated.",
};

export function isGroupKind(value: unknown): value is GroupKind {
  return value === "cohort" || value === "community";
}

// "Creator, AI for Africa" / "Participant, 30 Days AI Mastery" — the word depends on the role and the kind.
export function groupRoleLabel(role: GroupRole, kind: GroupKind): string {
  if (role === "creator") return "Creator";
  if (role === "host") return kind === "cohort" ? "Instructor" : "Host";
  return kind === "cohort" ? "Participant" : "Member";
}

// A group's public address: its custom slug when it has one (same flat namespace as every project), else its id.
export function getGroupPath(group: { id: string; slug?: string | null }): string {
  return group.slug ? `/${group.slug}` : `/groups/${group.id}`;
}
