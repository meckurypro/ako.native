// src/hooks/useAdCreatives.ts
//
// Backs the reserved ad slot on a profile owner's own toolbar (see
// ProfileAdSlot.tsx / ProfilePage.tsx) and the admin page that manages
// it. Reuses the exact same audience shape as email_campaigns / the
// notification blast — see useAdminComms.ts's AudienceInput — so the
// admin UI drives targeting with the same AudiencePicker component,
// unmodified.
//
// Targeting resolution for regular users happens entirely in RLS (see
// the ad_creatives migration): a user can only ever SELECT a row that
// is both active and actually targets them. This hook just fetches
// whatever rows are visible and picks the most specific one — it
// never needs to re-implement the targeting logic client-side.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useFeatureFlag } from "./useFeatureFlags";
import type { AudienceInput, AudienceType } from "../types/audience";
import { fileExtension, type LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";

export interface AdCreative {
  id: string;
  media_type: "image" | "video";
  media_path: string;
  link_url: string | null;
  audience_type: AudienceType;
  audience_filter: Record<string, unknown>;
  manual_recipient_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function publicUrlFor(path: string): string {
  return supabase.storage.from("ad-media").getPublicUrl(path).data.publicUrl;
}

// Most specific targeting wins when more than one active creative
// happens to match the same viewer (e.g. a "manual" override alongside
// a "tier" default for everyone else).
const SPECIFICITY: Record<AudienceType, number> = {
  manual: 3,
  page_followers: 2,
  tier: 1,
  all: 0,
};

/**
 * The one creative (if any) the CURRENT user should see in their own
 * profile toolbar right now. Returns null while loading, while the
 * profile_ads_enabled flag is off, or when nothing matches — every
 * one of those cases is "render nothing" for ProfileAdSlot.
 */
export function useActiveProfileAd() {
  const { user } = useAuth();
  const adsEnabled = useFeatureFlag("profile_ads_enabled");

  const query = useQuery({
    queryKey: ["active-profile-ad", user?.id],
    queryFn: async (): Promise<AdCreative | null> => {
      const { data, error } = await supabase
        .from("ad_creatives")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const rows = (data ?? []) as AdCreative[];
      if (rows.length === 0) return null;
      // RLS already guarantees every row here targets us — just pick
      // the most specific, then most recent, of whatever matched.
      rows.sort((a, b) => SPECIFICITY[b.audience_type] - SPECIFICITY[a.audience_type]);
      return rows[0];
    },
    enabled: !!user && adsEnabled,
    staleTime: 5 * 60 * 1000,
  });

  if (!adsEnabled || !query.data) return { creative: null, mediaUrl: null, isLoading: adsEnabled && query.isLoading };
  return { creative: query.data, mediaUrl: publicUrlFor(query.data.media_path), isLoading: false };
}

// ------------------------------------------------------------
// Admin
// ------------------------------------------------------------

export function useAdminAdCreatives() {
  return useQuery({
    queryKey: ["admin-ad-creatives"],
    queryFn: async (): Promise<AdCreative[]> => {
      const { data, error } = await supabase
        .from("ad_creatives")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AdCreative[];
    },
  });
}

export function useUploadAdMedia() {
  return useMutation({
    mutationFn: async (file: LocalFile): Promise<{ path: string; media_type: "image" | "video" }> => {
      const mediaType: "image" | "video" | null = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : null;
      if (!mediaType) throw new Error("Please choose an image or video file.");
      if (file.size > 50 * 1024 * 1024) throw new Error("File must be under 50MB.");

      const ext = fileExtension(file);
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await uploadLocalFile("ad-media", path, file);
      return { path, media_type: mediaType };
    },
  });
}

export interface SaveAdCreativeInput extends AudienceInput {
  media_type: "image" | "video";
  media_path: string;
  link_url: string | null;
  is_active: boolean;
}

export function useSaveAdCreative() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveAdCreativeInput) => {
      const { error } = await supabase.from("ad_creatives").insert({ ...input, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ad-creatives"] });
      queryClient.invalidateQueries({ queryKey: ["active-profile-ad"] });
    },
  });
}

export function useToggleAdCreative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("ad_creatives")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ad-creatives"] });
      queryClient.invalidateQueries({ queryKey: ["active-profile-ad"] });
    },
  });
}

export function useDeleteAdCreative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (creative: AdCreative) => {
      const { error } = await supabase.from("ad_creatives").delete().eq("id", creative.id);
      if (error) throw error;
      // Best-effort — an orphaned storage object is harmless clutter,
      // not worth failing the whole delete over.
      await supabase.storage.from("ad-media").remove([creative.media_path]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ad-creatives"] });
      queryClient.invalidateQueries({ queryKey: ["active-profile-ad"] });
    },
  });
}
