// src/components/ui/AuthPattern.tsx
// Sparse mudcloth-style grid behind Login / SignUp. 7×7 grid of 29 geometric
// motifs, each rotated in 90° steps, tiled at 476px. Rendered from the web
// build's own SVG data into assets/patterns/auth-pattern-tile*.png.
import { PatternBackground } from "./PatternBackground";

const TILE = require("../../../assets/patterns/auth-pattern-tile.png");

export function AuthPattern() {
  return <PatternBackground tile={TILE} opacity={0.07} />;
}
