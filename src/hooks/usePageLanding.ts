// src/hooks/usePageLanding.ts
// ============================================================
// Data for a Page's landing-page sections: the hero slideshow, and the
// team members an admin chose to show to visitors.
//
// Everything here tolerates ako_page_landing_revamp.sql not having been
// run yet: reads fall back to "nothing to show" instead of throwing, so
// shipping the app before the migration never breaks a page.
// ============================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Image as RNImage } from "react-native";
import { supabase } from "../lib/supabase";
import type { HeroDirection, PageHeroSlide, PageMemberWithProfile } from "../types/database";

export const MAX_HERO_SLIDES = 8;
export const MAX_FEATURED_MEMBERS = 12;
export const HERO_INTERVAL_OPTIONS = [3, 5, 8, 12] as const;

/** Every hero slide is framed 16:9, and the banner 8:3 — editors crop to these on upload. */
export const HERO_ASPECT = 16 / 9;
/** Hero slides keep the shape of the FIRST image uploaded (9:16, 1:1, 16:9, …), within these limits. */
export const HERO_MIN_ASPECT = 9 / 16;
export const HERO_MAX_ASPECT = 21 / 9;
export function clampHeroAspect(a: number): number {
  return Math.min(HERO_MAX_ASPECT, Math.max(HERO_MIN_ASPECT, a));
}

const heroAspectCache = new Map<string, number>();

/** Width / height of an already-uploaded slide image (cached). Resolves to 16:9 if it can't be read. */
export function loadHeroAspect(url: string): Promise<number> {
  const hit = heroAspectCache.get(url);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    RNImage.getSize(
      url,
      (w, h) => {
        const a = w > 0 && h > 0 ? clampHeroAspect(w / h) : HERO_ASPECT;
        heroAspectCache.set(url, a);
        resolve(a);
      },
      () => resolve(HERO_ASPECT)
    );
  });
}

/**
 * The page's hero aspect ratio: set by the first slide (lowest position); every other slide was cropped
 * to match it on upload. Returns 16:9 until the first image has been measured.
 */
export function useHeroAspect(slides: PageHeroSlide[] | undefined): number {
  const first = slides && slides.length ? [...slides].sort((a, b) => a.position - b.position)[0] : undefined;
  const url = first?.image_url;
  const [aspect, setAspect] = useState<number>(() => (url && heroAspectCache.get(url)) || HERO_ASPECT);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    loadHeroAspect(url).then((a) => alive && setAspect(a));
    return () => {
      alive = false;
    };
  }, [url]);
  return aspect;
}
export const BANNER_ASPECT = 8 / 3;

const SLIDE_SELECT = "id, page_id, image_url, title, caption, position, created_at";

export function usePageHeroSlides(pageId: string | undefined) {
  return useQuery({
    queryKey: ["page-hero-slides", pageId],
    queryFn: async (): Promise<PageHeroSlide[]> => {
      const { data, error } = await supabase
        .from("page_hero_slides")
        .select(SLIDE_SELECT)
        .eq("page_id", pageId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      // Table not created yet → no slides, not a broken page.
      if (error) return [];
      return (data ?? []) as PageHeroSlide[];
    },
    enabled: !!pageId,
    staleTime: 60_000,
  });
}

function useInvalidateHero(pageId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["page-hero-slides", pageId] });
}

export function useAddHeroSlide(pageId: string) {
  const invalidate = useInvalidateHero(pageId);
  return useMutation({
    mutationFn: async (input: { image_url: string; title?: string; caption?: string; position: number }) => {
      const { data, error } = await supabase
        .from("page_hero_slides")
        .insert({
          page_id: pageId,
          image_url: input.image_url,
          title: input.title?.trim() || null,
          caption: input.caption?.trim() || null,
          position: input.position,
        })
        .select(SLIDE_SELECT)
        .single();
      if (error) throw error;
      return data as PageHeroSlide;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateHeroSlide(pageId: string) {
  const invalidate = useInvalidateHero(pageId);
  return useMutation({
    mutationFn: async (input: { id: string; title: string; caption: string }) => {
      const { error } = await supabase
        .from("page_hero_slides")
        .update({ title: input.title.trim() || null, caption: input.caption.trim() || null })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteHeroSlide(pageId: string) {
  const invalidate = useInvalidateHero(pageId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("page_hero_slides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** `orderedIds` is the complete new order. */
export function useReorderHeroSlides(pageId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateHero(pageId);
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const { error } = await supabase.rpc("reorder_page_hero_slides", { p_page_id: pageId, p_ids: orderedIds });
      if (error) throw error;
    },
    // Reflect the new order immediately; the refetch confirms it.
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: ["page-hero-slides", pageId] });
      queryClient.setQueryData<PageHeroSlide[]>(["page-hero-slides", pageId], (old) =>
        old ? orderedIds.map((id, i) => ({ ...old.find((s) => s.id === id)!, position: i })).filter((s) => s.id) : old
      );
    },
    onSettled: invalidate,
  });
}

export interface HeroSettings {
  hero_autoplay: boolean;
  hero_interval_seconds: number;
  hero_direction: HeroDirection;
}

/** How the slideshow behaves — autoplay, seconds per slide, and which way it advances. */
export function useUpdateHeroSettings(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Partial<HeroSettings>) => {
      const { error } = await supabase.from("pages").update(settings).eq("id", pageId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["page"], refetchType: "all" }),
  });
}

/**
 * The people an admin chose to show on the page, in the order they chose.
 * This is deliberately the ONLY roster a visitor's page load fetches — never
 * the full team — so nothing public reveals how big the team is.
 */
export function usePageFeaturedMembers(pageId: string | undefined) {
  return useQuery({
    queryKey: ["page-featured-members", pageId],
    queryFn: async (): Promise<PageMemberWithProfile[]> => {
      const { data, error } = await supabase
        .from("page_members")
        .select(`*, profile:profiles!page_members_user_id_fkey(id, username, display_name, avatar_url, bio)`)
        .eq("page_id", pageId!)
        .eq("status", "active")
        .eq("show_on_page", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      // Column not created yet → nobody is featured.
      if (error) return [];
      return (data ?? []) as unknown as PageMemberWithProfile[];
    },
    enabled: !!pageId,
    staleTime: 60_000,
  });
}

function useInvalidateFeatured(pageId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["page-featured-members", pageId] }),
      queryClient.invalidateQueries({ queryKey: ["page-members", pageId] }),
    ]);
}

/** Admin: show or hide one team member on the public page. */
export function useSetMemberFeatured(pageId: string) {
  const invalidate = useInvalidateFeatured(pageId);
  return useMutation({
    mutationFn: async ({ user_id, featured }: { user_id: string; featured: boolean }) => {
      const { error } = await supabase.rpc("set_page_member_featured", {
        p_page_id: pageId,
        p_user_id: user_id,
        p_featured: featured,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Admin: `orderedUserIds` is the complete new order of the featured members. */
export function useReorderFeaturedMembers(pageId: string) {
  const invalidate = useInvalidateFeatured(pageId);
  return useMutation({
    mutationFn: async (orderedUserIds: string[]) => {
      const { error } = await supabase.rpc("reorder_page_featured_members", {
        p_page_id: pageId,
        p_user_ids: orderedUserIds,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Turn whatever someone typed into one clean, linkable website address (or null if blank/invalid). */
export function normalizeWebsite(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
