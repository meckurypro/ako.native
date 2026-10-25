// src/lib/customPageShapes.ts
//
// The 20 shapes a Custom Page's foreground image can be clipped to. Every shape is a single SVG path drawn in a 0..1
// unit box, so it scales to any size: the web renderer uses it as a CSS mask, native as an SVG clip path.
// `aspect` is the shape's natural width / height. Pure data, no DOM, safe to mirror verbatim in Ako.native.
//
// Adding a shape never needs a migration: the database accepts any short slug (see custom_page_config_problem).

export type ShapeId =
  | "circle"
  | "oval"
  | "rounded"
  | "rectangle"
  | "arch"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "star"
  | "badge"
  | "heart"
  | "leaf"
  | "drop"
  | "cloud"
  | "blob"
  | "wave"
  | "cross"
  | "parallelogram";

export interface ShapeDef {
  id: ShapeId;
  label: string;
  /** Width / height of the box the image is drawn in. */
  aspect: number;
  /** SVG path data in a 0..1 box. */
  path: string;
}

const r = (n: number) => Math.round(n * 10000) / 10000;

/** Scales raw points to fill the 0..1 box, and reports the natural aspect so nothing is stretched. */
function fit(points: [number, number][]): { path: string; aspect: number } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;
  const path = points.map(([x, y], i) => `${i ? "L" : "M"}${r((x - minX) / w)},${r((y - minY) / h)}`).join("") + "Z";
  return { path, aspect: r(w / h) };
}

function polygon(sides: number, startDeg: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((startDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  return fit(pts);
}

function star(points: number, inner: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (-90 + (180 / points) * i) * (Math.PI / 180);
    const rad = i % 2 === 0 ? 1 : inner;
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  return fit(pts);
}

function radial(steps: number, radius: (theta: number) => number) {
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const rad = radius(t);
    pts.push([Math.cos(t) * rad, Math.sin(t) * rad]);
  }
  return fit(pts);
}

function heart() {
  const pts: [number, number][] = [];
  for (let i = 0; i < 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    pts.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  }
  return fit(pts);
}

/** A flag-like ribbon: both long edges follow the same sine, so it reads as a wave rather than a wobbly box. */
function wave() {
  const top: [number, number][] = [];
  const bottom: [number, number][] = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    const y = Math.sin(x * Math.PI * 4) * 0.09;
    top.push([x, 0.12 + y]);
    bottom.push([x, 0.88 + y]);
  }
  return fit([...top, ...bottom.reverse()]);
}

const hex = polygon(6, 0);
const pent = polygon(5, -90);
const oct = polygon(8, 22.5);
const stars = star(5, 0.42);
const badge = radial(144, (t) => 0.92 + 0.08 * Math.cos(t * 12));
const blob = radial(144, (t) => 0.78 + 0.1 * Math.cos(2 * t + 1) + 0.07 * Math.cos(3 * t + 2) + 0.04 * Math.cos(5 * t));
const hrt = heart();
const wv = wave();

export const SHAPES: ShapeDef[] = [
  { id: "circle", label: "Circle", aspect: 1, path: "M0.5,0A0.5,0.5 0 1,1 0.5,1A0.5,0.5 0 1,1 0.5,0Z" },
  { id: "oval", label: "Oval", aspect: 0.75, path: "M0.5,0A0.5,0.5 0 1,1 0.5,1A0.5,0.5 0 1,1 0.5,0Z" },
  { id: "rounded", label: "Rounded square", aspect: 1, path: "M0.18,0H0.82A0.18,0.18 0 0 1 1,0.18V0.82A0.18,0.18 0 0 1 0.82,1H0.18A0.18,0.18 0 0 1 0,0.82V0.18A0.18,0.18 0 0 1 0.18,0Z" },
  { id: "rectangle", label: "Rectangle", aspect: 1.33, path: "M0,0H1V1H0Z" },
  { id: "arch", label: "Arch", aspect: 0.8, path: "M0,1V0.4A0.5,0.4 0 0 1 1,0.4V1Z" },
  { id: "triangle", label: "Triangle", aspect: 1.15, path: "M0.5,0L1,1L0,1Z" },
  { id: "diamond", label: "Diamond", aspect: 1, path: "M0.5,0L1,0.5L0.5,1L0,0.5Z" },
  { id: "pentagon", label: "Pentagon", aspect: pent.aspect, path: pent.path },
  { id: "hexagon", label: "Hexagon", aspect: hex.aspect, path: hex.path },
  { id: "octagon", label: "Octagon", aspect: oct.aspect, path: oct.path },
  { id: "star", label: "Star", aspect: stars.aspect, path: stars.path },
  { id: "badge", label: "Badge", aspect: 1, path: badge.path },
  { id: "heart", label: "Heart", aspect: hrt.aspect, path: hrt.path },
  { id: "leaf", label: "Leaf", aspect: 1, path: "M0,1C0,0.4 0.4,0 1,0C1,0.6 0.6,1 0,1Z" },
  { id: "drop", label: "Drop", aspect: 0.85, path: "M0.5,0C0.62,0.18 0.96,0.4 0.96,0.67C0.96,0.87 0.76,1 0.5,1C0.24,1 0.04,0.87 0.04,0.67C0.04,0.4 0.38,0.18 0.5,0Z" },
  { id: "cloud", label: "Cloud", aspect: 1.4, path: "M0.2,1C0.07,1 0,0.84 0.04,0.7C0.07,0.58 0.17,0.52 0.27,0.54C0.27,0.28 0.44,0.04 0.6,0.06C0.75,0.08 0.83,0.22 0.82,0.4C0.94,0.4 1,0.54 0.98,0.7C0.96,0.88 0.88,1 0.76,1Z" },
  { id: "blob", label: "Blob", aspect: 1, path: blob.path },
  { id: "wave", label: "Wave", aspect: 1.4, path: wv.path },
  { id: "cross", label: "Cross", aspect: 1, path: "M0.34,0H0.66V0.34H1V0.66H0.66V1H0.34V0.66H0V0.34H0.34Z" },
  { id: "parallelogram", label: "Slant", aspect: 1.3, path: "M0.22,0H1L0.78,1H0Z" },
];

export const SHAPE_BY_ID: Record<string, ShapeDef> = Object.fromEntries(SHAPES.map((s) => [s.id, s]));

/**
 * The shape's path scaled to a w × h pixel box, for react-native-svg clip paths. Only handles the absolute commands the
 * registry uses (M L H V C A Z). Arc radii scale with the box, which is right because no shape rotates its arcs.
 */
export function scaleShapePath(path: string, w: number, h: number): string {
  const out: string[] = [];
  const re = /([MLHVCAZ])([^MLHVCAZ]*)/g;
  let m: RegExpExecArray | null;
  const rr = (n: number) => Math.round(n * 100) / 100;
  while ((m = re.exec(path))) {
    const cmd = m[1];
    const n = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    if (cmd === "Z") out.push("Z");
    else if (cmd === "H") out.push(`H${rr(n[0] * w)}`);
    else if (cmd === "V") out.push(`V${rr(n[0] * h)}`);
    else if (cmd === "A") out.push(`A${rr(n[0] * w)},${rr(n[1] * h)} ${n[2]} ${n[3]} ${n[4]} ${rr(n[5] * w)},${rr(n[6] * h)}`);
    else {
      const pts: string[] = [];
      for (let i = 0; i < n.length; i += 2) pts.push(`${rr(n[i] * w)},${rr(n[i + 1] * h)}`);
      out.push(cmd + pts.join(" "));
    }
  }
  return out.join("");
}
