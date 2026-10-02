// src/hooks/useLibrary.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { ProjectType } from "./useProjects";

// The reference/content half of "things I have access to" — the other
// half (events, meetings, room meetings — things tied to a date) lives
// in useActivity.ts's useActivity(). This hook covers the durable,
// no-expiry kind: books, courses, and standalone media/file/url
// projects. Kept separate from useActivity on purpose — "what am I
// scheduled for" and "what's in my library" are different questions
// (see B_AKO_PERSONAL_PROJECT_LIBRARY_AND_ACCESS_UX_AUDIT.md) even
// though both answer "things I have access to".
//
// Room membership itself (as an ongoing community, not a room meeting)
// is surfaced separately too — see ProfilePage/Pages nav, not this hook.

export type LibraryItemType = Extract<ProjectType, "book" | "course" | "media" | "file" | "url">;

export interface LibraryItem {
  projectId: string;
  projectType: LibraryItemType;
  title: string;
  thumbnailUrl: string | null;
  status: string;
  // "purchased" = paid via the purchases table. "free" = the project
  // was free and access was only ever logged as an access event —
  // still belongs in the library (audit doc: "downloaded a file" /
  // "read a free book" should have a home too), just distinguished so
  // a user can tell a real purchase from something they just opened.
  acquiredVia: "purchased" | "free";
  acquiredAt: string;
}

const ROUTE_FOR: Record<LibraryItemType, (id: string) => string> = {
  book: (id) => `/books/${id}`,
  course: (id) => `/courses/${id}`,
  media: (id) => `/projects/${id}`,
  file: (id) => `/projects/${id}`,
  url: (id) => `/projects/${id}`,
};

export function libraryItemRoute(item: Pick<LibraryItem, "projectType" | "projectId">) {
  return ROUTE_FOR[item.projectType](item.projectId);
}

const LIBRARY_TYPES: LibraryItemType[] = ["book", "course", "media", "file", "url"];

export function useLibrary() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["library", user?.id],
    queryFn: async (): Promise<LibraryItem[]> => {
      const byProject = new Map<string, LibraryItem>();

      // Paid access — one row per purchase, already scoped to this
      // buyer by RLS/eq below.
      const { data: purchases } = await supabase
        .from("purchases")
        .select(
          "created_at, project:projects!purchases_project_id_fkey(id, title, thumbnail_url, project_type, status)"
        )
        .eq("buyer_id", user!.id);
      for (const row of (purchases as any[]) ?? []) {
        const p = row.project;
        if (!p || !LIBRARY_TYPES.includes(p.project_type)) continue;
        byProject.set(p.id, {
          projectId: p.id,
          projectType: p.project_type,
          title: p.title,
          thumbnailUrl: p.thumbnail_url,
          status: p.status,
          acquiredVia: "purchased",
          acquiredAt: row.created_at,
        });
      }

      // Free access — a project the user opened/downloaded/read for
      // free. Only fills in projects not already covered by a
      // purchase above (a project is either free or paid, never
      // both, but a host could flip pricing after the fact — purchase
      // record wins if somehow both exist).
      const { data: events } = await supabase
        .from("project_access_events")
        .select(
          "created_at, project:projects!project_access_events_project_id_fkey(id, title, thumbnail_url, project_type, status)"
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      for (const row of (events as any[]) ?? []) {
        const p = row.project;
        if (!p || !LIBRARY_TYPES.includes(p.project_type)) continue;
        if (byProject.has(p.id)) continue; // keep the purchase record
        byProject.set(p.id, {
          projectId: p.id,
          projectType: p.project_type,
          title: p.title,
          thumbnailUrl: p.thumbnail_url,
          status: p.status,
          acquiredVia: "free",
          acquiredAt: row.created_at,
        });
      }

      return Array.from(byProject.values()).sort(
        (a, b) => new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime()
      );
    },
    enabled: !!user,
  });
}
