import earcut, { deviation } from "earcut";
import { bbox } from "@turf/bbox";
import type { BBox, MultiPolygon, Polygon, Position } from "geojson";
import area, { EARTH_RADIUS } from "./area.js";

/**
 * Area of the part of areal features lying inside an areal filter.
 *
 * The filter is prepared once: its rings are copied into flat arrays and lazily clipped
 * to nested tiles, so that a feature only meets the filter positions near its bbox. Both
 * geometries are then clipped to their common box, which is split recursively in halves
 * until one side has few positions. A box that one side covers entirely, or not at all,
 * ends the recursion. At the leaves, the smaller side is triangulated (earcut) and the
 * rings of the other side are clipped by each triangle (Sutherland-Hodgman).
 *
 * Correctness rests on winding numbers: clipping a closed ring by a convex region keeps
 * its winding number inside the region and sets it to 0 outside, whatever zero-width
 * bridges the clipping leaves, so signed areas stay exact. Each ring carries mu = ±1 (+1
 * for an outer ring, -1 for a hole, times its orientation), the multiplicity of a geometry
 * is the sum of mu · winding over its rings, and the intersection area is the integral of
 * the product of both multiplicities: the polygons of a MultiPolygon are summed, overlaps
 * included, as `area` does.
 *
 * A ring detected as self-intersecting (no area but some extent, like a bow tie; a clipped
 * piece with the wrong orientation; a proper crossing where earcut fails) throws an
 * `InvalidGeometryError`. Detection is not exhaustive: a self-intersecting ring whose pieces
 * all keep its orientation counts with its winding numbers, as in `area`.
 *
 * Areas are exact on the sphere for edges straight in lon/lat (same integral and radius as
 * `area`), evaluated relative to a local origin to avoid cancellation on small rings.
 */

/** Area (m²) of the part of an areal feature lying inside the prepared filter. */
export type IntersectionArea = (geo: Polygon | MultiPolygon) => number;

/**
 * A box becomes a leaf when small × big <= min(MAX_LEAF_OPERATIONS, max(LEAF_PRODUCT, LEAF_FACTOR × (small + big)))
 * positions, a leaf costing about small × big triangle × position operations.
 */
const LEAF_PRODUCT = 1024;
const LEAF_FACTOR = 16;
const MAX_LEAF_OPERATIONS = 1e6;
/** Bound on the recursion, in case positions pile up at the same place: the leaf is then computed whatever its size. */
const MAX_DEPTH = 60;
/** Relative snap to the feature area, and to 0 (tighter, so that real slivers survive). */
const SNAP_FULL = 1e-9;
const SNAP_ZERO = 1e-12;
/** earcut deviation above which a signed fan is used instead (local coordinates are precise). */
const MAX_DEVIATION = 1e-9;

const DEGREES_TO_RADIANS = Math.PI / 180;
const HALF_DEGREES_TO_RADIANS = DEGREES_TO_RADIANS / 2;
const R2 = EARTH_RADIUS ** 2;

/** Thrown when a ring of the feature or of the filter is detected as self-intersecting. */
export class InvalidGeometryError extends Error {
  constructor(message = "Un anneau auto-intersectant a été détecté dans l'objet ou dans le filtre spatial.") {
    super(message);
    this.name = "InvalidGeometryError";
  }
}

/**
 * A ring in flat local coordinates `[x0, y0, x1, y1, ...]`, without its closing position,
 * with its bbox. `o` is the orientation of the original ring (+1 counterclockwise), `mu` is
 * `o` for an outer ring and `-o` for a hole.
 */
type Ring = { c: Float64Array; n: number; x0: number; y0: number; x1: number; y1: number; mu: number; o: number };

/** Latitude of the local origin, in radians, with its sine and cosine. */
type AreaContext = { phi0: number; s0: number; c0: number };

type Axis = 0 | 1;

// Scratch buffers, reused from one clip to the next: no state survives a call.
let bufferA = new Float64Array(1 << 12);
let bufferB = new Float64Array(1 << 12);

function growA(size: number) : Float64Array {
  if (bufferA.length < size) bufferA = new Float64Array(Math.max(size, 2 * bufferA.length));
  return bufferA;
}

function growB(size: number) : Float64Array {
  if (bufferB.length < size) bufferB = new Float64Array(Math.max(size, 2 * bufferB.length));
  return bufferB;
}

function polygonsOf(geo: Polygon | MultiPolygon) : Position[][][] {
  return geo.type == "Polygon" ? [geo.coordinates] : geo.coordinates;
}

// --- Rings ---

/** A clipped piece of a ring of orientation `o`, copied from the first `count2` values of `src`. */
function makeRing(src: Float64Array, count2: number, mu: number, o: number) : Ring {
  const c = src.slice(0, count2);
  const n = count2 >> 1;
  // bbox, and twice the planar signed area as a fan from the first position
  const ox = c[0], oy = c[1];
  let x0 = ox, y0 = oy, x1 = ox, y1 = oy;
  let area2 = 0, px = 0, py = 0;
  for (let i = 2; i < count2; i += 2) {
    const x = c[i], y = c[i + 1];
    if (x < x0) x0 = x;
    else if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    else if (y > y1) y1 = y;
    const qx = x - ox, qy = y - oy;
    area2 += px * qy - qx * py;
    px = qx;
    py = qy;
  }
  // The pieces of a simple ring keep its orientation: an opposite one, well beyond
  // rounding, reveals a self-intersecting ring.
  const extent = Math.max(x1 - x0, y1 - y0);
  const tolerance = 2e-6 * (x1 - x0) * (y1 - y0) + 1e-12 * n * extent * extent;
  if (area2 * o < -tolerance) throw new InvalidGeometryError();
  return { c, n, x0, y0, x1, y1, mu, o };
}

/**
 * Local copy of a GeoJSON ring (x = lon - lon0, y = lat - lat0), or null below 3 positions.
 * Repeated consecutive positions, the closing one included, are dropped: they add no area,
 * only work, and would pile up in the smallest boxes.
 */
function localRing(positions: Position[], lon0: number, lat0: number) : Ring | null {
  const c = new Float64Array(2 * positions.length);
  let n = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const position of positions) {
    const x = position[0] - lon0, y = position[1] - lat0;
    if (n > 0 && x === c[2 * n - 2] && y === c[2 * n - 1]) continue;
    c[2 * n] = x;
    c[2 * n + 1] = y;
    n++;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  while (n > 1 && c[2 * n - 2] === c[0] && c[2 * n - 1] === c[1]) n--;
  if (n < 3) return null;
  return { c: c.subarray(0, 2 * n), n, x0, y0, x1, y1, mu: 0, o: 0 };
}

/** Twice the planar signed area (positive counterclockwise), as a fan from the first position. */
function planarArea2(c: Float64Array, n: number) : number {
  const ox = c[0], oy = c[1];
  let s = 0;
  let px = c[2] - ox, py = c[3] - oy;
  for (let i = 4; i < 2 * n; i += 2) {
    const x = c[i] - ox, y = c[i + 1] - oy;
    s += px * y - x * py;
    px = x;
    py = y;
  }
  return s;
}

function countPositions(rings: Ring[]) : number {
  let n = 0;
  for (const r of rings) n += r.n;
  return n;
}

// --- Spherical area in local coordinates ---

/**
 * Signed area on the unit sphere (positive counterclockwise) of a ring in local coordinates,
 * for edges straight in lon/lat: the sum of dLon · sin(latMid) · sinc(dLat / 2), as `area`.
 * Since the dLon of a closed ring sum to 0, sin(latMid) · sinc is replaced by its difference
 * with sin(lat0), computed without cancellation, so that the error scales with the size of
 * the ring, not with |sin(lat)|.
 */
function localArea(c: Float64Array, n: number, ctx: AreaContext) : number {
  const { s0, c0, phi0 } = ctx;
  let sum = 0;
  let px = c[2 * n - 2], py = c[2 * n - 1];
  for (let i = 0; i < 2 * n; i += 2) {
    const x = c[i], y = c[i + 1];
    const dl = x - px;
    if (dl !== 0) {
      // u = (latMid - lat0) / 2 in radians; sin(lat0 + 2u) - sin(lat0) = 2 cos(lat0 + u) sin(u)
      const u = (y + py) * (HALF_DEGREES_TO_RADIANS / 2);
      let su: number, cosLat: number;
      if (u < 0.02 && u > -0.02) {
        const u2 = u * u;
        su = u * (1 - u2 / 6 * (1 - u2 / 20 * (1 - u2 / 42 * (1 - u2 / 72))));
        const cu = 1 - u2 / 2 * (1 - u2 / 12 * (1 - u2 / 30 * (1 - u2 / 56)));
        cosLat = c0 * cu - s0 * su;
      } else {
        su = Math.sin(u);
        cosLat = Math.cos(phi0 + u);
      }
      const dS = 2 * cosLat * su;
      // sinc(h) - 1, h = dLat / 2
      const h = (y - py) * HALF_DEGREES_TO_RADIANS;
      const h2 = h * h;
      const sincm1 = h2 < 1e-4
        ? -h2 / 6 * (1 - h2 / 20 * (1 - h2 / 42 * (1 - h2 / 72)))
        : Math.sin(h) / h - 1;
      sum += dl * (dS * (1 + sincm1) + s0 * sincm1);
    }
    px = x;
    py = y;
  }
  return -sum * DEGREES_TO_RADIANS;
}

/** Unit-sphere area of a box in local coordinates. */
function boxArea(x0: number, y0: number, x1: number, y1: number, ctx: AreaContext) : number {
  const mid = ctx.phi0 + (y0 + y1) * HALF_DEGREES_TO_RADIANS;
  return (x1 - x0) * DEGREES_TO_RADIANS * 2 * Math.cos(mid) * Math.sin((y1 - y0) * HALF_DEGREES_TO_RADIANS);
}

function sumArea(rings: Ring[], ctx: AreaContext) : number {
  let total = 0;
  for (const r of rings) total += r.mu * localArea(r.c, r.n, ctx);
  return total;
}

// --- Axis-aligned Sutherland-Hodgman ---

/**
 * Keep the part of ring `src` (n positions) on one side of the line coordinate[axis] = v:
 * `keepLow` keeps <= v, otherwise >= v. The crossing point is interpolated from the
 * endpoint with the smaller coordinate, so that an edge shared by two rings gives the
 * same point whatever its direction. Returns the number of positions written to `dst`.
 */
function axisPass(src: Float64Array, n: number, dst: Float64Array, axis: Axis, v: number, keepLow: boolean) : number {
  const other = 1 - axis;
  let m = 0;
  let pa = src[2 * n - 2 + axis], pb = src[2 * n - 2 + other];
  for (let i = 0; i < 2 * n; i += 2) {
    const qa = src[i + axis], qb = src[i + other];
    if ((pa < v && qa > v) || (pa > v && qa < v)) {
      const xb = pa < qa ? pb + (v - pa) / (qa - pa) * (qb - pb) : qb + (v - qa) / (pa - qa) * (pb - qb);
      if (axis === 0) {
        dst[m++] = v;
        dst[m++] = xb;
      } else {
        dst[m++] = xb;
        dst[m++] = v;
      }
    }
    if (keepLow ? qa <= v : qa >= v) {
      dst[m++] = src[i];
      dst[m++] = src[i + 1];
    }
    pa = qa;
    pb = qb;
  }
  return m >> 1;
}

/** Clip a ring to a box, or null when fewer than 3 positions survive. Only the sides crossing the ring's bbox are clipped. */
function clipRingToBox(r: Ring, bx0: number, by0: number, bx1: number, by1: number) : Ring | null {
  let src = r.c, n = r.n;
  let toA = true; // output buffer: bufferA, then bufferB, alternately
  const pass = (axis: Axis, v: number, keepLow: boolean) => {
    const dst = toA ? growA(4 * n) : growB(4 * n);
    toA = !toA;
    n = axisPass(src, n, dst, axis, v, keepLow);
    src = dst;
    return n >= 3;
  };
  if (r.x0 < bx0 && !pass(0, bx0, false)) return null;
  if (r.x1 > bx1 && !pass(0, bx1, true)) return null;
  if (r.y0 < by0 && !pass(1, by0, false)) return null;
  if (r.y1 > by1 && !pass(1, by1, true)) return null;
  return makeRing(src, 2 * n, r.mu, r.o);
}

/** Split a ring by the line coordinate[axis] = v into its closed halves. */
function splitRing(r: Ring, axis: Axis, v: number, low: Ring[], high: Ring[]) {
  const c = r.c, n = r.n;
  const lowBuffer = growA(4 * n), highBuffer = growB(4 * n);
  const other = 1 - axis;
  let nl = 0, nh = 0;
  let pa = c[2 * n - 2 + axis], pb = c[2 * n - 2 + other];
  for (let i = 0; i < 2 * n; i += 2) {
    const qa = c[i + axis], qb = c[i + other];
    if ((pa < v && qa > v) || (pa > v && qa < v)) {
      const xb = pa < qa ? pb + (v - pa) / (qa - pa) * (qb - pb) : qb + (v - qa) / (pa - qa) * (pb - qb);
      const x = axis === 0 ? v : xb, y = axis === 0 ? xb : v;
      lowBuffer[nl++] = x;
      lowBuffer[nl++] = y;
      highBuffer[nh++] = x;
      highBuffer[nh++] = y;
    }
    if (qa <= v) {
      lowBuffer[nl++] = c[i];
      lowBuffer[nl++] = c[i + 1];
    }
    if (qa >= v) {
      highBuffer[nh++] = c[i];
      highBuffer[nh++] = c[i + 1];
    }
    pa = qa;
    pb = qb;
  }
  if (nl >= 6) low.push(makeRing(lowBuffer, nl, r.mu, r.o));
  if (nh >= 6) high.push(makeRing(highBuffer, nh, r.mu, r.o));
}

function splitRings(rings: Ring[], axis: Axis, v: number, low: Ring[], high: Ring[]) {
  for (const r of rings) {
    const lo = axis === 0 ? r.x0 : r.y0;
    const hi = axis === 0 ? r.x1 : r.y1;
    if (hi <= v) low.push(r);
    else if (lo >= v) high.push(r);
    else splitRing(r, axis, v, low, high);
  }
}

/** Rings clipped to a box; a ring inside the box is kept as is (rings are never mutated). */
function clipRings(rings: Ring[], x0: number, y0: number, x1: number, y1: number) : Ring[] {
  const out: Ring[] = [];
  for (const r of rings) {
    if (r.x1 < x0 || r.x0 > x1 || r.y1 < y0 || r.y0 > y1) continue;
    if (r.x0 >= x0 && r.x1 <= x1 && r.y0 >= y0 && r.y1 <= y1) {
      out.push(r);
      continue;
    }
    const piece = clipRingToBox(r, x0, y0, x1, y1);
    if (piece) out.push(piece);
  }
  return out;
}

// --- Constant multiplicities ---

/**
 * Winding number inside the box of a ring lying on the box boundary (every edge along one
 * side, compared exactly), or NaN when the ring does not lie on the boundary.
 */
function boundaryWinding(r: Ring, bx0: number, by0: number, bx1: number, by1: number) : number {
  const c = r.c, n2 = 2 * r.n;
  let px = c[n2 - 2], py = c[n2 - 1];
  for (let i = 0; i < n2; i += 2) {
    const x = c[i], y = c[i + 1];
    if (!((x === bx0 && px === bx0) || (x === bx1 && px === bx1) || (y === by0 && py === by0) || (y === by1 && py === by1))) {
      return NaN;
    }
    px = x;
    py = y;
  }
  return Math.round(planarArea2(c, r.n) / (2 * (bx1 - bx0) * (by1 - by0)));
}

/** Move the rings lying on the box boundary into a constant multiplicity, returned; the others go to `rest`. */
function extractConstant(rings: Ring[], bx0: number, by0: number, bx1: number, by1: number, rest: Ring[]) : number {
  let constant = 0;
  for (const r of rings) {
    const k = boundaryWinding(r, bx0, by0, bx1, by1);
    if (Number.isNaN(k)) rest.push(r);
    else constant += r.mu * k;
  }
  return constant;
}

/** Multiplicity inside the box when every ring lies on its boundary, else NaN. */
function constantMultiplicity(rings: Ring[], bx0: number, by0: number, bx1: number, by1: number) : number {
  let constant = 0;
  for (const r of rings) {
    const k = boundaryWinding(r, bx0, by0, bx1, by1);
    if (Number.isNaN(k)) return NaN;
    constant += r.mu * k;
  }
  return constant;
}

// --- Recursive split of the box ---

/** Integral over the box of mF · mG, where mF (resp. mG) is sum(mu · winding) over the pieces of F (resp. G), all inside the box. */
function boxIntegral(F: Ring[], G: Ring[], x0: number, y0: number, x1: number, y1: number, depth: number, ctx: AreaContext) : number {
  if (F.length === 0 || G.length === 0) return 0;
  const F2: Ring[] = [], G2: Ring[] = [];
  const cF = extractConstant(F, x0, y0, x1, y1, F2);
  const cG = extractConstant(G, x0, y0, x1, y1, G2);
  let total = 0;
  if (cF !== 0 && cG !== 0) total += cF * cG * boxArea(x0, y0, x1, y1, ctx);
  if (cF !== 0 && G2.length) total += cF * sumArea(G2, ctx);
  if (cG !== 0 && F2.length) total += cG * sumArea(F2, ctx);
  if (F2.length && G2.length) total += solve(F2, G2, x0, y0, x1, y1, depth, ctx);
  return total;
}

/** Integral over the box of mF · mG, for non-empty sets of pieces not lying on the boundary. */
function solve(F: Ring[], G: Ring[], x0: number, y0: number, x1: number, y1: number, depth: number, ctx: AreaContext) : number {
  const nF = countPositions(F), nG = countPositions(G);
  const small = Math.min(nF, nG), big = Math.max(nF, nG);
  if (depth >= MAX_DEPTH || small * big <= Math.min(MAX_LEAF_OPERATIONS, Math.max(LEAF_PRODUCT, LEAF_FACTOR * (small + big)))) {
    return leaf(F, G, nF, nG, ctx);
  }
  const FL: Ring[] = [], FH: Ring[] = [], GL: Ring[] = [], GH: Ring[] = [];
  if (x1 - x0 >= y1 - y0) {
    const v = (x0 + x1) / 2;
    if (!(v > x0 && v < x1)) return leaf(F, G, nF, nG, ctx); // box too small to split
    splitRings(F, 0, v, FL, FH);
    splitRings(G, 0, v, GL, GH);
    return boxIntegral(FL, GL, x0, y0, v, y1, depth + 1, ctx) + boxIntegral(FH, GH, v, y0, x1, y1, depth + 1, ctx);
  }
  const v = (y0 + y1) / 2;
  if (!(v > y0 && v < y1)) return leaf(F, G, nF, nG, ctx);
  splitRings(F, 1, v, FL, FH);
  splitRings(G, 1, v, GL, GH);
  return boxIntegral(FL, GL, x0, y0, x1, v, depth + 1, ctx) + boxIntegral(FH, GH, x0, v, x1, y1, depth + 1, ctx);
}

// --- Leaves: triangulate the smaller side, clip the other side's rings by each triangle ---

function leaf(F: Ring[], G: Ring[], nF: number, nG: number, ctx: AreaContext) : number {
  const [A, B] = nF <= nG ? [F, G] : [G, F];
  let total = 0;
  for (const a of A) total += a.mu * ringIntegral(a, B, ctx);
  return total;
}

/** Integral of winding(a) · mB, where mB = sum(mu · winding) over the rings of B. */
function ringIntegral(a: Ring, B: Ring[], ctx: AreaContext) : number {
  const c = a.c, n = a.n;
  const area2 = planarArea2(c, n);
  if (area2 === 0) return 0;
  if (n === 3) return triangleIntegral(B, c[0], c[1], c[2], c[3], c[4], c[5], ctx) * (area2 > 0 ? 1 : -1);
  const indices = earcut(c, null, 2);
  if (deviation(c, null, 2, indices) <= MAX_DEVIATION) {
    // earcut triangles cover the inside of `a` once, where winding(a) = sign(area).
    let total = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = 2 * indices[i], i1 = 2 * indices[i + 1], i2 = 2 * indices[i + 2];
      total += triangleIntegral(B, c[i0], c[i0 + 1], c[i1], c[i1 + 1], c[i2], c[i2 + 1], ctx);
    }
    return area2 > 0 ? total : -total;
  }
  // earcut fails on the zero-width bridges left by Sutherland-Hodgman, which a signed fan
  // handles exactly, but also on self-intersecting rings, rejected.
  if (hasProperCrossing(c, n)) throw new InvalidGeometryError();
  // Signed fan from the first position: winding(a) = sum of the signed windings of its triangles.
  let total = 0;
  const ax = c[0], ay = c[1];
  for (let i = 2; i + 3 < 2 * n; i += 2) {
    const bx = c[i], by = c[i + 1], cx = c[i + 2], cy = c[i + 3];
    const cr = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (cr > 0) total += triangleIntegral(B, ax, ay, bx, by, cx, cy, ctx);
    else if (cr < 0) total -= triangleIntegral(B, ax, ay, bx, by, cx, cy, ctx);
  }
  return total;
}

/**
 * True when two edges of the ring cross at a point interior to both. Zero-width bridges
 * (collinear overlaps along a clipping line) and touching positions are not crossings, so
 * the pieces of a simple ring have none.
 */
function hasProperCrossing(c: Float64Array, n: number) : boolean {
  for (let i = 0; i < n; i++) {
    const i2 = 2 * i, j2 = i + 1 < n ? i2 + 2 : 0;
    const ax = c[i2], ay = c[i2 + 1], bx = c[j2], by = c[j2 + 1];
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minY = Math.min(ay, by), maxY = Math.max(ay, by);
    for (let k = i + 2; k < n; k++) {
      if (i === 0 && k === n - 1) continue; // adjacent through the closing edge
      const k2 = 2 * k, l2 = k + 1 < n ? k2 + 2 : 0;
      const cx = c[k2], cy = c[k2 + 1], dx = c[l2], dy = c[l2 + 1];
      if (Math.max(cx, dx) < minX || Math.min(cx, dx) > maxX || Math.max(cy, dy) < minY || Math.min(cy, dy) > maxY) continue;
      const o1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const o2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
      if (!((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0))) continue;
      const o3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
      const o4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
      if ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0)) return true;
    }
  }
  return false;
}

/** Integral of mB over a triangle (any orientation), i.e. sum(mu · signed area of ring ∩ triangle). */
function triangleIntegral(B: Ring[], ax: number, ay: number, bx: number, by: number, cx: number, cy: number, ctx: AreaContext) : number {
  const cr = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (cr === 0) return 0;
  if (cr < 0) {
    // Counterclockwise, so that the interior lies on the left of each edge.
    const tx = bx, ty = by;
    bx = cx;
    by = cy;
    cx = tx;
    cy = ty;
  }
  const tx0 = Math.min(ax, bx, cx), tx1 = Math.max(ax, bx, cx);
  const ty0 = Math.min(ay, by, cy), ty1 = Math.max(ay, by, cy);
  // A piece of a simple ring has the orientation of the ring: an opposite one, well beyond
  // rounding, reveals a self-intersecting ring. The rounding of `localArea` is a few ulps of
  // |dLon| · |local latitude| per edge, hence the second term.
  const extent = Math.max(tx1 - tx0, ty1 - ty0);
  const magnitude = Math.max(extent, Math.abs(tx0), Math.abs(tx1), Math.abs(ty0), Math.abs(ty1));
  const relative = 1e-6 * (tx1 - tx0) * (ty1 - ty0) * DEGREES_TO_RADIANS * DEGREES_TO_RADIANS;
  const rounding = 1e-12 * extent * magnitude * DEGREES_TO_RADIANS * DEGREES_TO_RADIANS;
  let total = 0;
  for (const r of B) {
    if (r.x1 < tx0 || r.x0 > tx1 || r.y1 < ty0 || r.y0 > ty1) continue;
    const clipped = clippedArea(r, ax, ay, bx, by, cx, cy, ctx);
    if (clipped * r.o < -(relative + rounding * r.n)) throw new InvalidGeometryError();
    total += r.mu * clipped;
  }
  return total;
}

/**
 * Sutherland-Hodgman pass keeping the left of the line s -> e. The crossing point is
 * interpolated from the endpoint lying strictly inside, whatever the edge direction.
 */
function trianglePass(src: Float64Array, n: number, dst: Float64Array, sx: number, sy: number, ex: number, ey: number) : number {
  const dx = ex - sx, dy = ey - sy;
  let m = 0;
  let px = src[2 * n - 2], py = src[2 * n - 1];
  let ps = dx * (py - sy) - dy * (px - sx);
  for (let i = 0; i < 2 * n; i += 2) {
    const qx = src[i], qy = src[i + 1];
    const qs = dx * (qy - sy) - dy * (qx - sx);
    if (ps > 0 ? qs < 0 : ps < 0 && qs > 0) {
      if (ps > 0) {
        const t = ps / (ps - qs);
        dst[m++] = px + t * (qx - px);
        dst[m++] = py + t * (qy - py);
      } else {
        const t = qs / (qs - ps);
        dst[m++] = qx + t * (px - qx);
        dst[m++] = qy + t * (py - qy);
      }
    }
    if (qs >= 0) {
      dst[m++] = qx;
      dst[m++] = qy;
    }
    px = qx;
    py = qy;
    ps = qs;
  }
  return m >> 1;
}

/** Unit-sphere signed area of ring ∩ triangle (counterclockwise triangle). */
function clippedArea(r: Ring, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, ctx: AreaContext) : number {
  let n = r.n;
  let dst = growA(4 * n);
  n = trianglePass(r.c, n, dst, ax, ay, bx, by);
  if (n < 3) return 0;
  let src = dst;
  dst = growB(4 * n);
  n = trianglePass(src, n, dst, bx, by, cx, cy);
  if (n < 3) return 0;
  src = dst;
  dst = growA(4 * n);
  n = trianglePass(src, n, dst, cx, cy, ax, ay);
  if (n < 3) return 0;
  return localArea(dst, n, ctx);
}

// --- Prepared filter ---

type PreparedFilter = {
  /** Local origin: the centre of the filter bbox. */
  ox: number;
  oy: number;
  /** Rings of the tile containing an absolute bbox, in local coordinates. */
  near: (minX: number, minY: number, maxX: number, maxY: number) => Ring[];
};

/**
 * Flat copy of the filter rings, clipped lazily to nested tiles, each from its parent. Tiles
 * are 1.5 times as wide as their cell, so that a bbox at most half a cell wide lies in the
 * tile of the cell containing its south-west corner; a ring lying inside a tile is shared,
 * not copied.
 */
function prepareFilter(filter: Polygon | MultiPolygon) : PreparedFilter {
  const [west, south, east, north] = bbox(filter);
  const ox = (west + east) / 2, oy = (south + north) / 2;
  const size = Math.max(east - west, north - south);
  const root: Ring[] = [];
  for (const polygon of polygonsOf(filter)) {
    for (let index = 0; index < polygon.length; index++) {
      const ring = localRing(polygon[index], ox, oy);
      if (!ring) continue;
      const area2 = planarArea2(ring.c, ring.n);
      if (Math.abs(area2) <= 1e-12 * 2 * (ring.x1 - ring.x0) * (ring.y1 - ring.y0)) {
        // No area but some extent: self-intersecting (a bow tie) or zero-width. Without extent, it covers nothing.
        if (ring.x1 > ring.x0 && ring.y1 > ring.y0) throw new InvalidGeometryError("Le filtre spatial contient un anneau auto-intersectant.");
        continue;
      }
      ring.o = area2 > 0 ? 1 : -1;
      ring.mu = (index == 0 ? 1 : -1) * ring.o;
      root.push(ring);
    }
  }
  const localWest = west - ox, localSouth = south - oy;
  const tiles = new Map<string, Ring[]>();
  function tile(zoom: number, x: number, y: number) : Ring[] {
    if (zoom == 0) return root;
    const key = `${zoom}/${x}/${y}`;
    let rings = tiles.get(key);
    if (rings === undefined) {
      const parent = tile(zoom - 1, Math.floor(x / 2), Math.floor(y / 2));
      const cell = size / 2 ** zoom;
      rings = parent.length == 0 ? parent : clipRings(parent, localWest + x * cell, localSouth + y * cell, localWest + (x + 1.5) * cell, localSouth + (y + 1.5) * cell);
      tiles.set(key, rings);
    }
    return rings;
  }
  return {
    ox, oy,
    near(minX, minY, maxX, maxY) {
      // Deepest tile whose cell is at least twice as wide as the bbox.
      const width = Math.max(maxX - minX, maxY - minY);
      let zoom = 0;
      while (zoom < 20 && 2 * width <= size / 2 ** (zoom + 1)) zoom++;
      const cell = size / 2 ** zoom;
      return tile(zoom, Math.floor((minX - west) / cell), Math.floor((minY - south) / cell));
    },
  };
}

// --- Entry point ---

/**
 * Prepare the filter once (per request), and return the function computing the area (m²)
 * of the part of each feature lying inside it. Both throw an `InvalidGeometryError` on a
 * ring detected as self-intersecting.
 */
export function makeIntersectionArea(filter: Polygon | MultiPolygon) : IntersectionArea {
  const prepared = prepareFilter(filter);
  return (geo) => {
    const featureBbox = bbox(geo);
    // The filter near the feature: its tile, then exactly the feature bbox.
    const [f0, f1, f2, f3] = featureBbox;
    const { ox, oy } = prepared;
    const fx0 = f0 - ox, fy0 = f1 - oy, fx1 = f2 - ox, fy1 = f3 - oy;
    const near = clipRings(prepared.near(f0, f1, f2, f3), fx0, fy0, fx1, fy1);
    if (near.length == 0) return 0;
    let W0 = Infinity, W1 = Infinity, W2 = -Infinity, W3 = -Infinity;
    for (const r of near) {
      if (r.x0 < W0) W0 = r.x0;
      if (r.y0 < W1) W1 = r.y0;
      if (r.x1 > W2) W2 = r.x1;
      if (r.y1 > W3) W3 = r.y1;
    }
    if (!(W2 > W0 && W3 > W1)) return 0; // no areal overlap
    if (W0 === fx0 && W1 === fy0 && W2 === fx1 && W3 === fy1) {
      // The filter covers the whole feature bbox, or none of it.
      const constant = constantMultiplicity(near, W0, W1, W2, W3);
      const result = Number.isNaN(constant) ? null : insideShortcut(constant, geo, featureBbox);
      if (result !== null) return result;
    }
    return featureIntegral(geo, near, W0, W1, W2, W3, ox, oy);
  };
}

/**
 * Result when the filter has a constant multiplicity over the whole feature bbox, or null to
 * take the general path: a feature without area but with some extent may be a bow tie,
 * which the general path rejects.
 */
function insideShortcut(constant: number, geo: Polygon | MultiPolygon, [f0, f1, f2, f3]: BBox) : number | null {
  if (constant <= 0) return 0;
  const featureArea = area(geo);
  const bboxArea = (f2 - f0) * (f3 - f1) * DEGREES_TO_RADIANS * DEGREES_TO_RADIANS * Math.cos((f1 + f3) / 2 * DEGREES_TO_RADIANS) * R2;
  if (!(featureArea > 1e-12 * bboxArea)) return null;
  return featureArea;
}

/**
 * Intersection area of the feature with the filter rings G, all in local coordinates
 * (relative to lon0, lat0), G lying inside the working box.
 */
function featureIntegral(
  geo: Polygon | MultiPolygon,
  G: Ring[],
  bx0: number, by0: number, bx1: number, by1: number,
  lon0: number, lat0: number,
) : number {
  const phi0 = lat0 * DEGREES_TO_RADIANS;
  const ctx: AreaContext = { phi0, s0: Math.sin(phi0), c0: Math.cos(phi0) };

  // The feature clipped to the working box.
  const F: Ring[] = [];
  const whole: Ring[] = []; // every ring of the feature, unclipped, for the snapping decision
  let clipped = false;
  let planarFeature2 = 0; // twice the planar area of the feature, for the snapping estimate
  for (const polygon of polygonsOf(geo)) {
    for (let index = 0; index < polygon.length; index++) {
      const ring = localRing(polygon[index], lon0, lat0);
      if (!ring) continue;
      const area2 = planarArea2(ring.c, ring.n);
      const bboxArea2 = 2 * (ring.x1 - ring.x0) * (ring.y1 - ring.y0);
      if (Math.abs(area2) <= 1e-12 * bboxArea2) {
        // No area but some extent: self-intersecting (a bow tie whose lobes cancel) or
        // zero-width. Without extent, it covers nothing.
        if (bboxArea2 > 0) throw new InvalidGeometryError("L'objet contient un anneau auto-intersectant.");
        continue;
      }
      const role = index == 0 ? 1 : -1;
      ring.o = area2 > 0 ? 1 : -1;
      ring.mu = role * ring.o;
      planarFeature2 += role * Math.abs(area2);
      whole.push(ring);
      if (ring.x0 >= bx0 && ring.x1 <= bx1 && ring.y0 >= by0 && ring.y1 <= by1) {
        F.push(ring);
        continue;
      }
      clipped = true;
      if (ring.x1 < bx0 || ring.x0 > bx1 || ring.y1 < by0 || ring.y0 > by1) continue;
      const piece = clipRingToBox(ring, bx0, by0, bx1, by1);
      if (piece) F.push(piece);
    }
  }
  const estimate = planarFeature2 / 2 * DEGREES_TO_RADIANS * DEGREES_TO_RADIANS * ctx.c0 * R2;

  const F2: Ring[] = [], G2: Ring[] = [];
  const cF = extractConstant(F, bx0, by0, bx1, by1, F2);
  const cG = extractConstant(G, bx0, by0, bx1, by1, G2);
  if (G2.length == 0 && !clipped) {
    // The filter covers the whole working box, which contains the feature, or none of it.
    return cG > 0 ? area(geo) : 0;
  }
  let total = 0;
  if (cF !== 0 && cG !== 0) total += cF * cG * boxArea(bx0, by0, bx1, by1, ctx);
  if (cF !== 0 && G2.length) total += cF * sumArea(G2, ctx);
  if (cG !== 0 && F2.length) total += cG * sumArea(F2, ctx);
  if (F2.length && G2.length) total += solve(F2, G2, bx0, by0, bx1, by1, 0, ctx);
  return snap(total * R2, geo, estimate, () => sumArea(whole, ctx) * R2);
}

/**
 * Snap to the feature area (within SNAP_FULL, or above it: capped) or to 0 (within
 * SNAP_ZERO). The exact feature area is only computed when the planar estimate says that
 * the result may be close to either.
 */
function snap(total: number, geo: Polygon | MultiPolygon, estimate: number, localFeatureArea: () => number) : number {
  if (Number.isNaN(total)) throw new Error("intersection area is NaN");
  if (total <= 0) return 0;
  if (total <= 100 * SNAP_ZERO * estimate || total >= 0.5 * estimate) {
    // Decided on the same (local) formula as `total`; the snapped value is `area`, so that
    // a feature inside the filter gets exactly its `area`.
    const featureArea = localFeatureArea();
    if (total >= featureArea * (1 - SNAP_FULL)) return area(geo);
    if (total <= featureArea * SNAP_ZERO) return 0;
  }
  return total;
}
