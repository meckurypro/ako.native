// src/lib/projectImages.ts
//
// Supporting images for a project (projects.supporting_image_urls, max 4).
// They exist ONLY on the project's own page: the visitor swipes the thumbnail to
// reveal them while deciding to buy / explore. Grids, lists, rails and cards keep
// using thumbnail_url alone — never call projectGalleryImages() from those.
// (Mirrors the web repo's src/lib/projectImages.ts.)

export const MAX_SUPPORTING_IMAGES = 4;

interface HasImages {
  thumbnail_url: string | null;
  supporting_image_urls?: string[] | null;
}

/**
 * Thumbnail first, then supporting images in the creator's order. Empty when the
 * project has no thumbnail: supporting images only ever hang off a thumbnail.
 */
export function projectGalleryImages(project: HasImages): string[] {
  if (!project.thumbnail_url) return [];
  const extras = (project.supporting_image_urls ?? []).filter(Boolean).slice(0, MAX_SUPPORTING_IMAGES);
  return [project.thumbnail_url, ...extras];
}
