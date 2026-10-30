// src/lib/discoverTileShape.ts
// Each kind of content on Discover gets its own tile shape (and a width that suits it), so a row of audio & video
// doesn't look like a row of groups. Discover only — a project's cover is still drawn at its natural shape elsewhere.
//
//   books    2:3  portrait   (the shape book covers are required to be, so nothing is cropped)
//   talents  3:4  portrait
//   events   4:5  poster
//   groups   1:1  square     (communities and cohorts)
//   pitches  5:4
//   courses  4:3  landscape
//   meetings 3:2  landscape
//   audio & video 16:9 wide
//   links    2:1  banner
export interface DiscoverTileShape {
  /** width ÷ height */
  ratio: number;
  /** Rail width in points; the "More" grids pass their own column width instead. */
  width: number;
}

const SHAPES: Record<string, DiscoverTileShape> = {
  book: { ratio: 2 / 3, width: 104 },
  gig: { ratio: 3 / 4, width: 112 },
  event: { ratio: 4 / 5, width: 120 },
  room: { ratio: 1, width: 120 },
  pitch: { ratio: 5 / 4, width: 136 },
  course: { ratio: 4 / 3, width: 152 },
  meeting: { ratio: 3 / 2, width: 148 },
  media: { ratio: 16 / 9, width: 176 },
  url: { ratio: 2, width: 152 },
};

const DEFAULT_SHAPE: DiscoverTileShape = { ratio: 1, width: 104 };

export function discoverTileShape(projectType: string | null | undefined): DiscoverTileShape {
  return (projectType && SHAPES[projectType]) || DEFAULT_SHAPE;
}
