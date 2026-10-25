// src/hooks/useCustomPages.ts
// Custom Pages data layer. Every write goes through a SECURITY DEFINER function in supabase/ako_custom_pages.sql,
// which validates the config and checks ownership — the client never writes the tables directly (except an
// inquiry's status, which RLS lets the owner change).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import {
  CUSTOM_PAGES_BUCKET,
  type CustomPageConfig,
  type CustomPageInquiry,
  type CustomPageRow,
  type CustomPageStats,
  type CustomPageSummary,
  type PublicCustomPage,
} from "../lib/customPage";
import type { LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";
import { useAuth } from "./useAuth";

const keys = {
  mine: (uid?: string) => ["custom-pages", "mine", uid] as const,
  one: (id?: string) => ["custom-pages", "one", id] as const,
  public: (slug?: string) => ["custom-pages", "public", slug] as const,
  stats: (id?: string, days?: number) => ["custom-pages", "stats", id, days] as const,
  inquiries: (id?: string) => ["custom-pages", "inquiries", id] as const,
};

export function useMyCustomPages() {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.mine(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<CustomPageSummary[]> => {
      const { data, error } = await supabase.rpc("list_my_custom_pages");
      if (error) throw error;
      return (data ?? []) as CustomPageSummary[];
    },
  });
}

/** The owner's own row (draft + published) — what the editor works on. */
export function useCustomPage(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: keys.one(id),
    enabled: !!id && !!user,
    queryFn: async (): Promise<CustomPageRow | null> => {
      const { data, error } = await supabase.from("custom_pages").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data as CustomPageRow | null) ?? null;
    },
  });
}

/** What a visitor sees at /<slug>. `null` = nothing there (the caller falls through to Projects). */
export function usePublicCustomPage(slug: string | undefined) {
  return useQuery({
    queryKey: keys.public(slug),
    enabled: !!slug,
    staleTime: 60_000,
    queryFn: async (): Promise<PublicCustomPage | null> => {
      const { data, error } = await supabase.rpc("get_public_custom_page", { p_slug: slug });
      if (error) throw error;
      return (data as PublicCustomPage | null) ?? null;
    },
  });
}

function useInvalidateMine() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return (id?: string, slug?: string) => {
    void qc.invalidateQueries({ queryKey: keys.mine(user?.id) });
    if (id) void qc.invalidateQueries({ queryKey: keys.one(id) });
    void qc.invalidateQueries({ queryKey: ["custom-pages", "public"] });
    if (slug) void qc.invalidateQueries({ queryKey: keys.public(slug) });
  };
}

export function useCreateCustomPage() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: async (v: { name: string; slug: string; refSlug?: string | null }): Promise<CustomPageRow> => {
      const { data, error } = await supabase.rpc("create_custom_page", {
        p_name: v.name,
        p_slug: v.slug,
        p_ref_slug: v.refSlug ?? null,
      });
      if (error) throw error;
      return data as CustomPageRow;
    },
    onSuccess: (row) => invalidate(row.id),
  });
}

export function useSaveCustomPageDraft() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: async (v: { id: string; config: CustomPageConfig }): Promise<CustomPageRow> => {
      const { data, error } = await supabase.rpc("save_custom_page_draft", { p_page_id: v.id, p_config: v.config });
      if (error) throw error;
      return data as CustomPageRow;
    },
    onSuccess: (row) => invalidate(row.id, row.slug),
  });
}

export function usePublishCustomPage() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: async (id: string): Promise<CustomPageRow> => {
      const { data, error } = await supabase.rpc("publish_custom_page", { p_page_id: id });
      if (error) throw error;
      return data as CustomPageRow;
    },
    onSuccess: (row) => invalidate(row.id, row.slug),
  });
}

export function useUnpublishCustomPage() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: async (id: string): Promise<CustomPageRow> => {
      const { data, error } = await supabase.rpc("unpublish_custom_page", { p_page_id: id });
      if (error) throw error;
      return data as CustomPageRow;
    },
    onSuccess: (row) => invalidate(row.id, row.slug),
  });
}

export function useSetCustomPageSlug() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: async (v: { id: string; slug: string }): Promise<CustomPageRow> => {
      const { data, error } = await supabase.rpc("set_custom_page_slug", { p_page_id: v.id, p_slug: v.slug });
      if (error) throw error;
      return data as CustomPageRow;
    },
    onSuccess: (row) => invalidate(row.id, row.slug),
  });
}

export function useSetCustomPageVisibility() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: async (v: { id: string; visibility: "public" | "unlisted" | "private" }): Promise<CustomPageRow> => {
      const { data, error } = await supabase.rpc("set_custom_page_visibility", {
        p_page_id: v.id,
        p_visibility: v.visibility,
      });
      if (error) throw error;
      return data as CustomPageRow;
    },
    onSuccess: (row) => invalidate(row.id, row.slug),
  });
}

export function useDeleteCustomPage() {
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.rpc("delete_custom_page", { p_page_id: id });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

export async function checkCustomPageSlugAvailable(slug: string, excludePageId?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_custom_page_slug_available", {
    p_slug: slug,
    p_exclude_page_id: excludePageId ?? null,
  });
  if (error) throw error;
  return data === true;
}

export function useCustomPageStats(id: string | undefined, days = 30) {
  return useQuery({
    queryKey: keys.stats(id, days),
    enabled: !!id,
    queryFn: async (): Promise<CustomPageStats> => {
      const { data, error } = await supabase.rpc("get_custom_page_stats", { p_page_id: id, p_days: days });
      if (error) throw error;
      return data as CustomPageStats;
    },
  });
}

export function useCustomPageInquiries(id: string | undefined) {
  return useQuery({
    queryKey: keys.inquiries(id),
    enabled: !!id,
    queryFn: async (): Promise<CustomPageInquiry[]> => {
      const { data, error } = await supabase
        .from("custom_page_inquiries")
        .select("*")
        .eq("page_id", id!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CustomPageInquiry[];
    },
  });
}

export function useSetInquiryStatus(pageId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = useInvalidateMine();
  return useMutation({
    mutationFn: async (v: { id: string; status: CustomPageInquiry["status"] }) => {
      const { error } = await supabase.from("custom_page_inquiries").update({ status: v.status }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.inquiries(pageId) });
      invalidate();
    },
  });
}

// ── Visitor-side (anonymous allowed) ────────────────────────────────────────────────────────────────────────
export async function submitCustomPageInquiry(v: {
  pageId: string;
  name: string;
  contact: string;
  subject: string;
  message: string;
  honeypot: string;
}): Promise<void> {
  const { error } = await supabase.rpc("submit_custom_page_inquiry", {
    p_page_id: v.pageId,
    p_name: v.name,
    p_contact: v.contact,
    p_subject: v.subject,
    p_message: v.message,
    p_hp: v.honeypot,
  });
  if (error) throw error;
}

/** Fire-and-forget analytics. Never throws and never blocks the click it describes. */
export function recordCustomPageEvent(pageId: string, type: "view" | "cta_click" | "download" | "create_click", visitor: string, ctaId?: string) {
  void supabase
    .rpc("record_custom_page_event", { p_page_id: pageId, p_type: type, p_cta_id: ctaId ?? null, p_visitor: visitor })
    .then(
      () => undefined,
      () => undefined,
    );
}

// ── Uploads ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function uploadCustomPageFile(path: string, file: LocalFile): Promise<void> {
  await uploadLocalFile(CUSTOM_PAGES_BUCKET, path, file);
}
