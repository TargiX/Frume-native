import type { BiomorphicEdge, BiomorphicPoint as Point } from './generateBiomorphic';

export const GEOMETRY_EPSILON = 1e-10;
export type FlatPoint = Point & { knot: number };
export type Line = { a: Point; b: Point };
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const samePoint = (a: Point, b: Point) => distance(a, b) <= GEOMETRY_EPSILON;
export const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
});
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

export function project(p: Point, { a, b }: Line) {
  const v = sub(b, a);
  const squared = v.x * v.x + v.y * v.y;
  const t = squared === 0 ? 0 : Math.max(0, Math.min(1,
    ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / squared));
  return { point: mix(a, b, t), t };
}

/** Includes endpoint contacts and overlapping collinear segments. */
export function lineContact(first: Line, second: Line):
  { point: Point; overlap: boolean; t: number; u: number } | null {
  const r = sub(first.b, first.a), s = sub(second.b, second.a), q = sub(second.a, first.a);
  const denominator = cross(r, s);
  const scale = Math.max(1e-20, distance(first.a, first.b) * distance(second.a, second.b));
  if (Math.abs(denominator) > 1e-12 * scale) {
    const t = cross(q, s) / denominator, u = cross(q, r) / denominator;
    if (t < -1e-10 || t > 1 + 1e-10 || u < -1e-10 || u > 1 + 1e-10) return null;
    return { point: mix(first.a, first.b, t), overlap: false, t, u };
  }
  const candidates: { point: Point; t: number; u: number }[] = [];
  for (const t of [0, 1]) {
    const point = mix(first.a, first.b, t), other = project(point, second);
    if (samePoint(point, other.point)) candidates.push({ point, t, u: other.t });
  }
  for (const u of [0, 1]) {
    const point = mix(second.a, second.b, u), other = project(point, first);
    if (samePoint(point, other.point)) candidates.push({ point, t: other.t, u });
  }
  if (!candidates.length) return null;
  const hit = candidates[0];
  return { ...hit, overlap: candidates.some(c => !samePoint(c.point, hit.point)) };
}

export function closestLines(first: Line, second: Line) {
  const dx = first.b.x - first.a.x, dy = first.b.y - first.a.y;
  const ex = second.b.x - second.a.x, ey = second.b.y - second.a.y;
  const rx = first.a.x - second.a.x, ry = first.a.y - second.a.y;
  const aa = dx * dx + dy * dy, ee = ex * ex + ey * ey, bb = dx * ex + dy * ey;
  const cc = dx * rx + dy * ry, ff = ex * rx + ey * ry;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  let t = 0, u = 0;
  if (aa === 0) u = ee === 0 ? 0 : clamp(ff / ee);
  else if (ee === 0) t = clamp(-cc / aa);
  else {
    const denominator = aa * ee - bb * bb;
    t = denominator > aa * ee * 1e-14 ? clamp((bb * ff - cc * ee) / denominator) : 0;
    u = (bb * t + ff) / ee;
    if (u < 0) { u = 0; t = clamp(-cc / aa); }
    else if (u > 1) { u = 1; t = clamp((bb - cc) / aa); }
  }
  const a = mix(first.a, first.b, t), b = mix(second.a, second.b, u);
  return { a, b, t, u, width: distance(a, b) };
}

/** Control-hull distance to the finite chord bounds Bezier flattening error. */
export function flattenEdge(edge: BiomorphicEdge, tolerance: number): FlatPoint[] {
  if (!edge.segments.length) throw new Error(`Empty edge ${edge.id}`);
  const result: FlatPoint[] = [{ ...edge.segments[0].start, knot: 0 }];
  edge.segments.forEach((segment, index) => {
    const points = segment.kind === 'line' ? [segment.start, segment.end]
      : [segment.start, segment.control1, segment.control2, segment.end];
    if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error(`Non-finite edge ${edge.id}`);
    if (!samePoint(result[result.length - 1], segment.start)) throw new Error(`Broken edge ${edge.id}`);
    if (segment.kind === 'line') { result.push({ ...segment.end, knot: index + 1 }); return; }
    const flatten = (a: Point, b: Point, c: Point, d: Point, t0: number, t1: number, depth: number) => {
      const error = Math.max(distance(b, project(b, { a, b: d }).point), distance(c, project(c, { a, b: d }).point));
      if (error <= tolerance) { result.push({ ...d, knot: index + t1 }); return; }
      if (depth === 18) throw new Error(`Unresolved curve ${edge.id}`);
      const ab = mix(a, b, 0.5), bc = mix(b, c, 0.5), cd = mix(c, d, 0.5);
      const abc = mix(ab, bc, 0.5), bcd = mix(bc, cd, 0.5), mid = mix(abc, bcd, 0.5), tm = (t0 + t1) / 2;
      flatten(a, ab, abc, mid, t0, tm, depth + 1);
      flatten(mid, bcd, cd, d, tm, t1, depth + 1);
    };
    flatten(segment.start, segment.control1, segment.control2, segment.end, 0, 1, 0);
  });
  return result;
}

/** Candidate pairs in a spatial hash; keys remain valid outside the board. */
export function forNearbyPairs<T extends Line>(items: readonly T[], size: number,
  margin: number, visit: (a: T, b: T, i: number, j: number) => void): void {
  const buckets = new Map<string, number[]>();
  items.forEach((item, index) => {
    const tested = new Set<number>();
    const x0 = Math.floor((Math.min(item.a.x, item.b.x) - margin) / size), x1 = Math.floor((Math.max(item.a.x, item.b.x) + margin) / size);
    const y0 = Math.floor((Math.min(item.a.y, item.b.y) - margin) / size), y1 = Math.floor((Math.max(item.a.y, item.b.y) + margin) / size);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = `${x},${y}`, bucket = buckets.get(key) ?? [];
      for (const previous of bucket) if (!tested.has(previous)) {
        tested.add(previous); visit(items[previous], item, previous, index);
      }
      bucket.push(index); buckets.set(key, bucket);
    }
  });
}

export function insidePolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
