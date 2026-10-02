// src/hooks/useProjectFaqs.ts
//
// Backs the FAQ section on ProjectDetail: read for everyone the project
// is visible to, write for the owner only (matches project_faqs' RLS
// exactly — see the migration). Templates are seeded per project_type
// for the types that actually benefit from an FAQ (event, file, course,
// meeting, gig, book, pitch) — useScaffoldProjectFaqs below calls the
// scaffold_project_faqs DB function to copy them in.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface ProjectFaq {
  id: string;
  project_id: string;
  question: string;
  answer: string;
  sort_order: number;
  source_template_id: string | null;
}

export interface FaqTemplate {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

// Kept in sync with project_faq_templates' own CHECK constraint —
// the types that get an FAQ section at all. Not every project_type
// belongs here (media/room/url deliberately excluded, see the
// create_project_faqs migration).
export const FAQ_ELIGIBLE_TYPES = ["event", "file", "course", "meeting", "gig", "book", "pitch"] as const;

export function projectTypeSupportsFaq(projectType: string): boolean {
  return (FAQ_ELIGIBLE_TYPES as readonly string[]).includes(projectType);
}

export function useProjectFaqs(projectId: string) {
  return useQuery({
    queryKey: ["project-faqs", projectId],
    queryFn: async (): Promise<ProjectFaq[]> => {
      const { data, error } = await supabase
        .from("project_faqs")
        .select("id, project_id, question, answer, sort_order, source_template_id")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

export function useFaqTemplates(projectType: string) {
  return useQuery({
    queryKey: ["faq-templates", projectType],
    queryFn: async (): Promise<FaqTemplate[]> => {
      const { data, error } = await supabase
        .from("project_faq_templates")
        .select("id, question, answer, sort_order")
        .eq("project_type", projectType)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: projectTypeSupportsFaq(projectType),
    // Starter copy changes essentially never.
    staleTime: 60 * 60 * 1000,
  });
}

/** One-click scaffold: drops in every starter question for this
 *  project's type via the DB-side helper, skipping any already added
 *  (safe to call again after deleting some — see scaffold_project_faqs). */
export function useScaffoldProjectFaqs(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("scaffold_project_faqs", { p_project_id: projectId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-faqs", projectId] });
    },
  });
}

export function useAddProjectFaq(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ question, answer }: { question: string; answer: string }) => {
      const { data: existing } = await supabase
        .from("project_faqs")
        .select("sort_order")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error } = await supabase.from("project_faqs").insert({
        project_id: projectId,
        question: question.trim(),
        answer: answer.trim(),
        sort_order: (existing?.sort_order ?? -1) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-faqs", projectId] });
    },
  });
}

export function useUpdateProjectFaq(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, question, answer }: { id: string; question: string; answer: string }) => {
      const { error } = await supabase
        .from("project_faqs")
        .update({ question: question.trim(), answer: answer.trim() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-faqs", projectId] });
    },
  });
}

export function useDeleteProjectFaq(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_faqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-faqs", projectId] });
    },
  });
}
