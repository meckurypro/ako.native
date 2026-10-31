// src/lib/thumbnailFit.ts
// How a project's cover image is laid out on its card / own page.
//
// The box is the shape the thumbnail was created in (lib/thumbnailSpec.ts) — the same shape it has on Discover, in
// embeds and in lists. The picture always fills it edge to edge ("cover"): a thumbnail made through the crop sheet is
// already exactly that shape, and an older one of another shape is centre-cropped, never stretched or letterboxed.
import { thumbnailRatioOf, type ThumbnailCarrier } from "./thumbnailSpec";

/** The box never grows past this share of the viewport height (the picture still fills it). */
export const MAX_THUMB_HEIGHT_VH = 0.7;

export interface ThumbnailLayout {
  /** width ÷ height of the box */
  aspectRatio: number;
  fit: "cover";
}

export function thumbnailLayout(project: ThumbnailCarrier): ThumbnailLayout {
  return { aspectRatio: thumbnailRatioOf(project), fit: "cover" };
}
