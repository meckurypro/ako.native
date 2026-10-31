// src/lib/bookCover.ts
// Book covers are 2:3 portrait, always. The upload UI only accepts 2:3 images, and every place a book's cover
// is shown draws it in a 2:3 box, so nothing is cropped and nothing sits in empty bars.
export const BOOK_COVER_RATIO = 2 / 3;
/** Allow a small rounding drift (e.g. 1000×1499) so exact-2:3 exports are never rejected. */
export const BOOK_COVER_TOLERANCE = 0.02;

export const BOOK_COVER_HINT = "Book covers are 2:3 portrait. Choose any picture — if it isn't 2:3 you'll crop it to fit.";
export const BOOK_COVER_ERROR =
  "This image isn't 2:3. Book covers must be 2:3 portrait (e.g. 1600 × 2400 px) — crop or resize it and try again.";

export function isBookCoverRatio(width: number, height: number): boolean {
  if (!width || !height || width <= 0 || height <= 0) return false;
  return Math.abs(width / height - BOOK_COVER_RATIO) / BOOK_COVER_RATIO <= BOOK_COVER_TOLERANCE;
}

export function isBookType(projectType: string | null | undefined): boolean {
  return projectType === "book";
}

/** Tailwind class for a thumbnail box: 2:3 for books, otherwise the caller's fallback (e.g. "aspect-square"). */
export function thumbBoxAspectClass(projectType: string | null | undefined, fallback: string): string {
  return isBookType(projectType) ? "aspect-[2/3]" : fallback;
}
