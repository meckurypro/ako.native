// src/lib/thumbnailSpec.ts
// The ONE place that says what shape a project's thumbnail is.
//
// Every kind of project has a single shape. That shape is enforced where the thumbnail is created (the crop sheet,
// the upload hook, and a database trigger) and is the shape it is drawn in everywhere it appears (Discover, cards,
// embeds, lists, share sheets). Nothing else in the app should hard-code a thumbnail ratio.
//
//   book                 2:3   portrait cover
//   audio                1:1   square cover art
//   video                16:9  widescreen
//   talent               2:1   landscape profile banner
//   group (room)         1:1   square
//   event                4:5   poster
//   pitch                5:4
//   course               4:3
//   meeting              3:2
//   link (url)           2:1   banner
//   file                 no thumbnail (the folder art stands in)
//
// "media" is one project type for both audio and video. It is a video (16:9) when the project has a video, otherwise
// audio cover art (1:1). Keep this file identical in ako (web) and ako.native, and keep the database's
// snap_thumbnail_shape() / allowed shapes (ako_thumbnail_shape_enforcement migration) in step with it.

export type ThumbShape = "1:1" | "16:9" | "2:3" | "2:1" | "4:5" | "5:4" | "4:3" | "3:2";

export interface ThumbSpec {
  shape: ThumbShape;
  /** width / height */
  ratio: number;
  /** Exact pixel size a cropped thumbnail is exported at. */
  outWidth: number;
  outHeight: number;
  /** Short human name, e.g. "Square (1:1)". */
  label: string;
}

function spec(shape: ThumbShape, outWidth: number, outHeight: number, label: string): ThumbSpec {
  return { shape, ratio: outWidth / outHeight, outWidth, outHeight, label };
}

export const THUMB_SPECS: Record<ThumbShape, ThumbSpec> = {
  "1:1": spec("1:1", 1200, 1200, "Square (1:1)"),
  "16:9": spec("16:9", 1600, 900, "Widescreen (16:9)"),
  "2:3": spec("2:3", 1200, 1800, "Portrait (2:3)"),
  "2:1": spec("2:1", 1600, 800, "Banner (2:1)"),
  "4:5": spec("4:5", 1200, 1500, "Poster (4:5)"),
  "5:4": spec("5:4", 1500, 1200, "Landscape (5:4)"),
  "4:3": spec("4:3", 1600, 1200, "Landscape (4:3)"),
  "3:2": spec("3:2", 1500, 1000, "Landscape (3:2)"),
};

/** How far a picture's ratio may drift from a standard one and still count as that shape (rounding, odd exports). */
export const THUMB_TOLERANCE = 0.02;

/** Shapes a project of this type may carry. Mirrored by the database trigger. */
const ALLOWED: Record<string, ThumbShape[]> = {
  book: ["2:3"],
  gig: ["2:1"],
  media: ["1:1", "16:9"],
  room: ["1:1"],
  event: ["4:5"],
  pitch: ["5:4"],
  course: ["4:3"],
  meeting: ["3:2"],
  url: ["2:1"],
};

/** The shape drawn when a project has no (or an off-standard, older) thumbnail. */
const DEFAULT_SHAPE: Record<string, ThumbShape> = {
  book: "2:3",
  gig: "2:1",
  media: "1:1",
  room: "1:1",
  event: "4:5",
  pitch: "5:4",
  course: "4:3",
  meeting: "3:2",
  url: "2:1",
};

/** The shape of a media project: video when it has a video, otherwise audio cover art. */
export function mediaShape(hasVideo: boolean | null | undefined): ThumbShape {
  return hasVideo ? "16:9" : "1:1";
}

export function thumbnailAllowedShapes(projectType: string | null | undefined): ThumbShape[] {
  return (projectType && ALLOWED[projectType]) || ["1:1"];
}

export function isThumbShape(value: unknown): value is ThumbShape {
  return typeof value === "string" && value in THUMB_SPECS;
}

/**
 * The spec a thumbnail must meet when it is created or changed. null for a project with no thumbnail (a file).
 * For media pass whether the project has video; it decides between 16:9 and 1:1.
 */
export function thumbnailSpecFor(projectType: string | null | undefined, opts: { hasVideo?: boolean | null } = {}): ThumbSpec | null {
  if (!projectType || projectType === "file") return null;
  if (projectType === "media") return THUMB_SPECS[mediaShape(opts.hasVideo)];
  return THUMB_SPECS[DEFAULT_SHAPE[projectType] ?? "1:1"];
}

/** The standard shape a width x height falls in, or null when it is none of them. */
export function snapThumbShape(width?: number | null, height?: number | null): ThumbShape | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const r = width / height;
  let best: ThumbShape | null = null;
  let bestDiff = Infinity;
  for (const s of Object.values(THUMB_SPECS)) {
    const diff = Math.abs(r - s.ratio);
    if (diff / s.ratio <= THUMB_TOLERANCE && diff < bestDiff) {
      best = s.shape;
      bestDiff = diff;
    }
  }
  return best;
}

/** True when a width x height is the spec's shape (within tolerance). */
export function matchesThumbSpec(width: number | null | undefined, height: number | null | undefined, target: ThumbSpec | null): boolean {
  if (!target) return true;
  return snapThumbShape(width, height) === target.shape;
}

export interface ThumbnailCarrier {
  project_type?: string | null;
  thumbnail_shape?: string | null;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
}

/**
 * The shape to DRAW a project's thumbnail in, everywhere. It is the shape it was created in (the stored
 * thumbnail_shape, or the snapped stored dimensions) as long as that is allowed for the project's type; an older
 * thumbnail of some other shape is drawn in the type's default shape, centre-cropped (object-cover), never stretched.
 */
export function thumbnailShapeOf(p: ThumbnailCarrier): ThumbShape {
  const stored = isThumbShape(p.thumbnail_shape) ? p.thumbnail_shape : snapThumbShape(p.thumbnail_width, p.thumbnail_height);
  const allowed = thumbnailAllowedShapes(p.project_type);
  if (stored && allowed.includes(stored)) return stored;
  return (p.project_type && DEFAULT_SHAPE[p.project_type]) || "1:1";
}

export function thumbnailRatioOf(p: ThumbnailCarrier): number {
  return THUMB_SPECS[thumbnailShapeOf(p)].ratio;
}

/** True when the project has a thumbnail whose shape isn't one its type allows — the owner should re-crop it. */
export function thumbnailNeedsRecrop(p: ThumbnailCarrier & { thumbnail_url?: string | null }): boolean {
  if (!p.thumbnail_url || p.project_type === "file") return false;
  const stored = isThumbShape(p.thumbnail_shape) ? p.thumbnail_shape : snapThumbShape(p.thumbnail_width, p.thumbnail_height);
  return !stored || !thumbnailAllowedShapes(p.project_type).includes(stored);
}

/** Width of a Discover rail tile per shape, in points. Same widths as the web rail's `w-[…]` classes. */
export const RAIL_TILE_WIDTH: Record<ThumbShape, number> = {
  "2:3": 104,
  "1:1": 120,
  "4:5": 120,
  "5:4": 136,
  "4:3": 152,
  "3:2": 148,
  "16:9": 176,
  "2:1": 168,
};

/** What to call the thumbnail in the UI: "video thumbnail", "book cover", … */
export function thumbnailNoun(projectType: string | null | undefined, hasVideo?: boolean | null): string {
  switch (projectType) {
    case "book": return "book cover";
    case "media": return hasVideo ? "video thumbnail" : "audio cover";
    case "gig": return "talent banner";
    case "room": return "group thumbnail";
    case "url": return "link banner";
    default: return "thumbnail";
  }
}

/** The largest box of the project's thumbnail shape that fits inside maxW x maxH (px). For embeds and previews. */
export function fitThumbBox(p: ThumbnailCarrier, maxW: number, maxH: number): { width: number; height: number } {
  const ratio = thumbnailRatioOf(p);
  let width = maxW;
  let height = width / ratio;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Style for a small thumbnail in a list row, in the project's own shape. `base` is the row icon's usual
 * square size; wide shapes get a wider box (so they stay legible), tall ones keep the width and grow taller.
 */
export function thumbBoxStyle(p: ThumbnailCarrier, base: number): { width: number; aspectRatio: number } {
  const ratio = thumbnailRatioOf(p);
  return { width: ratio > 1 ? Math.round(base * Math.min(ratio, 1.8) * 0.95) : base, aspectRatio: ratio };
}
