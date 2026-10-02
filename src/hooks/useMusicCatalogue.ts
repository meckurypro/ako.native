// src/hooks/useMusicCatalogue.ts
//
// Akọ Music Catalogue — publishing/discovery layer over an existing
// Audio Project. See done/AKO_MUSIC_CATALOGUE_AND_CREATOR_DISCOVERY_SYSTEM.md
// and the music_catalogue_v1 Supabase migration + publish-music /
// unpublish-music edge functions.
//
// Every write that touches rights, ownership, splits, price, or
// publication state goes through an edge function (publish-music /
// unpublish-music) — never a direct client insert/update on
// music_catalogue* tables (RLS blocks those; see the migration).
// Reads (search, single entry, my published music) are plain
// supabase-js selects, same as the rest of this codebase.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { LocalFile } from "../lib/localFile";
import { uploadLocalFile } from "../lib/storageUpload";
import type {
  ContributorDraft,
  EligibleAudioProject,
  MusicCatalogueContributorWithProfile,
  MusicCatalogueWithContributors,
  MusicLicenceAgreement,
  MusicSearchResult,
  PendingMusicCredit,
} from "../types/music";

const CATALOGUE_BUCKET = "music-catalogue";

function publicUrlFor(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(CATALOGUE_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ------------------------------------------------------------
// Licence agreement
// ------------------------------------------------------------
export function useCurrentLicenceAgreement() {
  return useQuery({
    queryKey: ["music-licence-agreement", "current"],
    queryFn: async (): Promise<MusicLicenceAgreement> => {
      const { data, error } = await supabase
        .from("music_licence_agreements")
        .select("*")
        .eq("is_current", true)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 60 * 1000, // an hour — this changes rarely
  });
}

// ------------------------------------------------------------
// Eligible Audio Projects to publish from
// ------------------------------------------------------------
export function useMyAudioProjects() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-audio-projects", user?.id],
    queryFn: async (): Promise<EligibleAudioProject[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, title, thumbnail_url, project_media_details!inner(has_audio, audio_url, audio_file_path, audio_source)"
        )
        .eq("owner_id", user.id)
        .eq("project_type", "media")
        .eq("project_media_details.has_audio", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title,
        thumbnail_url: row.thumbnail_url,
        audio_url: row.project_media_details?.audio_url ?? null,
        audio_file_path: row.project_media_details?.audio_file_path ?? null,
        audio_source: row.project_media_details?.audio_source ?? null,
      }));
    },
    enabled: !!user,
  });
}

// ------------------------------------------------------------
// Upload the derived clip / cover art to the public catalogue bucket
// ------------------------------------------------------------
export function useUploadCatalogueAsset() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ file, extension }: { file: LocalFile; extension: string }): Promise<string> => {
      if (!user) throw new Error("Not signed in");
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      await uploadLocalFile(CATALOGUE_BUCKET, path, file);
      return path;
    },
  });
}

// ------------------------------------------------------------
// Publish — the whole flow (rights + licence + contributors + clip)
// in one call. See supabase/functions/publish-music.
// ------------------------------------------------------------
interface PublishMusicInput {
  project_id: string;
  title: string;
  primary_artist_name: string;
  cover_image_path: string | null;
  clip_file_path: string;
  clip_start_seconds: number;
  clip_duration_seconds: number;
  usage_mode: "free" | "paid";
  usage_price_usd: number | null;
  rights_declaration_accepted: boolean;
  contributors: ContributorDraft[];
}

export function usePublishMusic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: PublishMusicInput) => {
      const { data, error } = await supabase.functions.invoke("publish-music", {
        body: {
          ...input,
          contributors: input.contributors.map((c) => ({
            contributor_id: c.contributor_id,
            role: c.role,
            split_percent: c.split_percent,
          })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: true; catalogue: MusicCatalogueWithContributors };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-published-music"] });
      queryClient.invalidateQueries({ queryKey: ["music-catalogue-search"] });
    },
  });
}

export function useUnpublishMusic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (catalogueId: string) => {
      const { data, error } = await supabase.functions.invoke("unpublish-music", {
        body: { catalogue_id: catalogueId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-published-music"] });
      queryClient.invalidateQueries({ queryKey: ["music-catalogue-search"] });
    },
  });
}

// ------------------------------------------------------------
// My published music (for a lightweight "manage my music" list)
// ------------------------------------------------------------
export function useMyPublishedMusic() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-published-music", user?.id],
    queryFn: async (): Promise<MusicCatalogueWithContributors[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("music_catalogue")
        .select("*, contributors:music_catalogue_contributors(*, contributor:profiles(id, username, display_name, avatar_url))")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(hydrateCatalogueEntry);
    },
    enabled: !!user,
  });
}

// ------------------------------------------------------------
// Search — composer's "Add music" (title / artist / featured artist)
// ------------------------------------------------------------
export function useMusicCatalogueSearch(query: string) {
  return useQuery({
    queryKey: ["music-catalogue-search", query.trim()],
    queryFn: async (): Promise<MusicSearchResult[]> => {
      const trimmed = query.trim();
      let request = supabase
        .from("music_catalogue")
        .select("*, contributors:music_catalogue_contributors(role, contributor:profiles(display_name))")
        .eq("publication_status", "published")
        .order("published_at", { ascending: false })
        .limit(25);

      if (trimmed) {
        request = request.or(`title.ilike.%${trimmed}%,primary_artist_name.ilike.%${trimmed}%`);
      }

      const { data, error } = await request;
      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title,
        primary_artist_name: row.primary_artist_name,
        cover_url: publicUrlFor(row.cover_image_path),
        clip_url: publicUrlFor(row.clip_file_path)!,
        clip_duration_seconds: row.clip_duration_seconds,
        featured_artist_names: (row.contributors ?? [])
          .filter((c: any) => c.role === "featured_artist")
          .map((c: any) => c.contributor?.display_name)
          .filter(Boolean),
      }));
    },
  });
}

// ------------------------------------------------------------
// Single entry, with contributors resolved — for post attribution
// and the discovery sheet.
// ------------------------------------------------------------
export function useMusicCatalogueEntry(catalogueId: string | null | undefined) {
  return useQuery({
    queryKey: ["music-catalogue-entry", catalogueId],
    queryFn: async (): Promise<MusicCatalogueWithContributors | null> => {
      if (!catalogueId) return null;
      const { data, error } = await supabase
        .from("music_catalogue")
        .select("*, contributors:music_catalogue_contributors(*, contributor:profiles(id, username, display_name, avatar_url))")
        .eq("id", catalogueId)
        .maybeSingle();
      if (error) throw error;
      return data ? hydrateCatalogueEntry(data) : null;
    },
    enabled: !!catalogueId,
  });
}

function hydrateCatalogueEntry(row: any): MusicCatalogueWithContributors {
  return {
    ...row,
    contributors: (row.contributors ?? []) as MusicCatalogueContributorWithProfile[],
    clip_url: publicUrlFor(row.clip_file_path)!,
    cover_url: publicUrlFor(row.cover_image_path),
  };
}

// ------------------------------------------------------------
// Credit acceptance (Gig role expansion & collaboration, sections
// 9, 11): publish-music tags a non-publisher contributor's row
// 'pending' — they must accept before any Gig relationship forms.
// See respond_to_music_credit() in the reconcile_gig_automation_
// with_upstream_schema migration.
// ------------------------------------------------------------
export function useMyPendingMusicCredits() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-pending-music-credits", user?.id],
    queryFn: async (): Promise<PendingMusicCredit[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("music_catalogue_contributors")
        .select(
          `role, catalogue:music_catalogue!inner(id, title, primary_artist_name, cover_image_path,
             creator:profiles!music_catalogue_creator_id_fkey(id, username, display_name, avatar_url))`
        )
        .eq("contributor_id", user.id)
        .eq("status", "pending");
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        catalogue_id: row.catalogue.id,
        role: row.role,
        title: row.catalogue.title,
        primary_artist_name: row.catalogue.primary_artist_name,
        cover_url: publicUrlFor(row.catalogue.cover_image_path),
        creator: row.catalogue.creator,
      }));
    },
    enabled: !!user,
  });
}

export function useRespondToMusicCredit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ catalogueId, accept }: { catalogueId: string; accept: boolean }) => {
      const { data, error } = await supabase.rpc("respond_to_music_credit", {
        p_catalogue_id: catalogueId,
        p_accept: accept,
      });
      if (error) throw error;
      return data as { status: string; gig_id: string | null; gig_created: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-pending-music-credits"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-categories"] });
    },
  });
}

export function useRecordMusicUsageEvent() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      catalogueId,
      eventType,
      postId,
    }: {
      catalogueId: string;
      eventType: "attribution_tap" | "profile_visit" | "project_visit" | "play";
      postId?: string;
    }) => {
      await supabase.from("music_catalogue_usage_events").insert({
        catalogue_id: catalogueId,
        event_type: eventType,
        post_id: postId ?? null,
        actor_id: user?.id ?? null,
      });
    },
  });
}
