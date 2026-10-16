// src/lib/thumbnailFit.ts
// How a project's cover image is laid out on its card / own page.
//
// The box used to take the picture's raw aspect ratio, so a tall poster or book cover (say 2:3) produced a box
// 1.5× as tall as the screen is wide, and an ultra-wide banner a thin sliver. Now the ratio is clamped to a
// comfortable range; a picture inside the range fills the box (cover), one outside it is shown whole on the
// card background (contain) instead of being cropped or stretching the page.
export const MIN_THUMB_RATIO = 4 / 5; // tallest box: portrait 4:5
export const MAX_THUMB_RATIO = 2; // widest box: 2:1
export const DEFAULT_THUMB_RATIO = 16 / 9; // unknown size
/** The box never grows past this share of the viewport height (the picture still fits inside it). */
export const MAX_THUMB_HEIGHT_VH = 0.7;

export interface ThumbnailLayout {
  /** width / height of the box */
  aspectRatio: number;
  /** "cover" when the picture fits the box's range, "contain" when it had to be clamped */
  fit: "cover" | "contain";
}

export function thumbnailLayout(width?: number | null, height?: number | null): ThumbnailLayout {
  if (!width || !height || width <= 0 || height <= 0) return { aspectRatio: DEFAULT_THUMB_RATIO, fit: "cover" };
  const natural = width / height;
  const aspectRatio = Math.min(MAX_THUMB_RATIO, Math.max(MIN_THUMB_RATIO, natural));
  return { aspectRatio, fit: Math.abs(natural - aspectRatio) < 0.01 ? "cover" : "contain" };
}
