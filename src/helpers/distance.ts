import RBush from "rbush";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import DistanceOp from "jsts/org/locationtech/jts/operation/distance/DistanceOp.js";
import type { Geometry, Position } from "geojson";
import { distVincenty } from "node-vincenty";

/**
 * Minimal geodesic distance between two GeoJSON geometries, reported in meters
 * together with the closest point found on each side.
 *
 * Antimeridian-crossing geometries (any Polygon ring or LineString segment with
 * |Δlon| > 180°) are rejected: per RFC 7946 they SHOULD be split before being
 * passed here (Polygon → MultiPolygon, LineString → MultiLineString).
 * Antimeridian-adjacent geometry *pairs* (individually valid, but facing each
 * other across ±180°) are rejected too: the planar nearest-point search below
 * cannot resolve them correctly.
 *
 * The implementation follows three steps:
 * 1. ask JTS for an exact planar nearest-point seed and an early zero-distance check,
 * 2. decompose both geometries into vertices and segments with an R-tree index,
 * 3. refine the best geodesic answer by projecting vertices onto candidate segments,
 *    pruning most edges through cheap bounds and the R-tree index.
 */

export interface DistanceResult {
  distance: number;
  point1: Position;
  point2: Position;
}

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;
// Smallest WGS84 meridional meters per latitude degree (near the equator).
// We use this conservative floor where bounds must never overestimate distance:
// pruning lower-bounds and latitude expansion in search boxes.
const MIN_LAT_METERS_PER_DEGREE = 110_574;
// Spherical meters per degree from EARTH_RADIUS_M.
// Used for spherical approximations (haversine and lon/lat scaling heuristics).
const SPHERE_METERS_PER_DEGREE = EARTH_RADIUS_M * DEG_TO_RAD;

interface Edge {
  a: Position;
  b: Position;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  lonMetersPerDegree: number;
}

interface Shape {
  vertices: Position[];
  edges: Edge[];
  edgeIndex: RBush<Edge> | null;
}

interface NearestPoint {
  distance: number;
  point: Position;
}

/** Returns the great-circle distance between two lon/lat positions in meters. */
export function haversine(a: Position, b: Position): number {
  const phi1 = a[1]*DEG_TO_RAD;
  const phi2 = b[1]*DEG_TO_RAD;
  const dPhi = phi2 - phi1;
  const dLambda = (b[0] - a[0])*DEG_TO_RAD;
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Throws if any ring (Polygon/MultiPolygon) or segment (LineString/MultiLineString)
 * has a longitude jump > 180°, indicating an antimeridian-crossing geometry that
 * SHOULD be split per RFC 7946 before being used here.
 */
function assertNoAntimeridian(geom: Geometry): void {
  function checkCoords(coords: Position[]): void {
    for (let i = 0; i < coords.length - 1; i++) {
      if (Math.abs(coords[i + 1][0] - coords[i][0]) > 180)
        throw new Error(
          "Antimeridian-crossing geometries SHOULD be split per RFC 7946 " +
          "(Polygon → MultiPolygon, LineString → MultiLineString)",
        );
    }
  }
  switch (geom.type) {
    case "LineString":         checkCoords(geom.coordinates); break;
    case "MultiLineString":    geom.coordinates.forEach(checkCoords); break;
    case "Polygon":            geom.coordinates.forEach(checkCoords); break;
    case "MultiPolygon":       geom.coordinates.forEach(poly => poly.forEach(checkCoords)); break;
    case "GeometryCollection": geom.geometries.forEach(assertNoAntimeridian); break;
  }
}

/** Returns the [min, max] longitude spanned by a set of vertices. */
function lonExtent(vertices: Position[]): [number, number] {
  let min = Infinity, max = -Infinity;
  for (const [lon] of vertices) {
    if (lon < min) min = lon;
    if (lon > max) max = lon;
  }
  return [min, max];
}

/**
 * Throws if gA and gB's vertex extents are closer going the other way around
 * ±180° than directly: JTS's planar nearest-point search and the R-tree pruning
 * below assume a flat lon/lat plane and would then silently pick the wrong,
 * far-side pairing (see the module docstring).
 */
function assertNoAntimeridianPair(verticesA: Position[], verticesB: Position[]): void {
  const [aMin, aMax] = lonExtent(verticesA);
  const [bMin, bMax] = lonExtent(verticesB);
  const rawGap = Math.max(0, bMin - aMax, aMin - bMax);
  const wrappedGap = 360 - Math.max(aMax, bMax) + Math.min(aMin, bMin);
  if (wrappedGap < rawGap)
    throw new Error(
      "Antimeridian-adjacent geometry pair: the shortest path appears to cross ±180° " +
      "longitude, which this planar-nearest-point implementation cannot resolve correctly",
    );
}

/** Precomputes one segment with its bbox and longitude scaling metadata. */
function makeEdge(a: Position, b: Position): Edge {
  const minX = Math.min(a[0], b[0]);
  const maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  const maxAbsLat = Math.max(Math.abs(minY), Math.abs(maxY));
  return { a, b, minX, maxX, minY, maxY, lonMetersPerDegree: SPHERE_METERS_PER_DEGREE * Math.cos(maxAbsLat*DEG_TO_RAD) };
}

/**
 * Decomposes a geometry into its vertices and edges, then builds a search Shape.
 * An R-tree index is created for shapes with more than 64 edges.
 */
function buildShape(geom: Geometry): Shape {
  const vertices: Position[] = [];
  const edges: Edge[] = [];

  function process(g: Geometry): void {
    switch (g.type) {
      case "Point":      vertices.push(g.coordinates); break;
      case "MultiPoint": vertices.push(...g.coordinates); break;
      case "LineString":
        vertices.push(...g.coordinates);
        for (let i = 0; i < g.coordinates.length - 1; i++) edges.push(makeEdge(g.coordinates[i], g.coordinates[i + 1]));
        break;
      case "MultiLineString":
        for (const line of g.coordinates) {
          vertices.push(...line);
          for (let i = 0; i < line.length - 1; i++) edges.push(makeEdge(line[i], line[i + 1]));
        }
        break;
      case "Polygon":
        for (const ring of g.coordinates) {
          vertices.push(...ring);
          for (let i = 0; i < ring.length - 1; i++) edges.push(makeEdge(ring[i], ring[i + 1]));
        }
        break;
      case "MultiPolygon":
        for (const poly of g.coordinates)
          for (const ring of poly) {
            vertices.push(...ring);
            for (let i = 0; i < ring.length - 1; i++) edges.push(makeEdge(ring[i], ring[i + 1]));
          }
        break;
      case "GeometryCollection":
        for (const child of g.geometries) process(child);
        break;
    }
  }

  process(geom);
  const edgeIndex = edges.length > 64 // R-tree build cost is ~O(n log n); only worthwhile beyond this edge count
    ? new RBush<Edge>().load(edges) : null;
  return { vertices, edges, edgeIndex };
}

/** Interpolates a point at parameter t along a lon/lat segment. */
function pointOnSegment(a: Position, b: Position, t: number): Position {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Maps one lon/lat position to its unit vector on the Earth sphere. */
function toUnitVector([lon, lat]: Position): [number, number, number] {
  const phi = lat*DEG_TO_RAD;
  const lambda = lon*DEG_TO_RAD;
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

/** Projects a point onto a segment in 3D chord space and clamps the result to [0,1]. */
function chordProjection(p: Position, a: Position, b: Position): number {
  const [px, py, pz] = toUnitVector(p);
  const [ax, ay, az] = toUnitVector(a);
  const [bx, by, bz] = toUnitVector(b);
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const length2 = dx * dx + dy * dy + dz * dz;
  if (length2 < 1e-18) return 0; // squared chord length ≈ 0 → degenerate segment, return t=0
  const t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / length2;
  return Math.min(1, Math.max(0, t));
}

/** Refines the nearest point from p onto one segment until cm / 0.5% precision is reached. */
function nearestOnSegment(p: Position, a: Position, b: Position, pointDistance: (a: Position, b: Position) => number): NearestPoint {
  const distanceAt = (t: number) => pointDistance(p, pointOnSegment(a, b, t));

  // Start from the orthogonal projection in 3D chord space, then refine locally
  // on the actual lon/lat segment with progressively smaller steps.
  let t = chordProjection(p, a, b);
  let best = distanceAt(t);
  const segmentLengthMeters = pointDistance(a, b);
  const arcAngle = segmentLengthMeters / EARTH_RADIUS_M;
  const requiredPrecisionMeters = Math.max(0.01, 0.005 * best); // stop when step < 0.5% of best distance, floored at 1 cm

  for (
    let step = Math.min(0.5, 0.2 * arcAngle); // initial step: 0.2 of the arc angle (radians), capped at 0.5 t-units (half segment)
    step * segmentLengthMeters > requiredPrecisionMeters;
    step /= 2
  ) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const dt of [step, -step]) {
        const candidate = Math.min(1, Math.max(0, t + dt));
        const d = distanceAt(candidate);
        if (d < best) {
          best = d;
          t = candidate;
          improved = true;
        }
      }
    }
  }

  return { distance: best, point: pointOnSegment(a, b, t) };
}

/** Computes a cheap metric lower bound from a point to an edge bbox. */
function lowerBoundToEdge(p: Position, edge: Edge, pLonMetersPerDegree: number = SPHERE_METERS_PER_DEGREE*Math.cos(p[1]*DEG_TO_RAD)): number {
  const latGap = Math.max(0, edge.minY - p[1], p[1] - edge.maxY);
  const lonGap = Math.max(0, edge.minX - p[0], p[0] - edge.maxX);
  const lonMetersPerDegree = Math.min(edge.lonMetersPerDegree, pLonMetersPerDegree);
  return Math.max(latGap * MIN_LAT_METERS_PER_DEGREE, lonGap * lonMetersPerDegree);
}

/**
 * Expands a metric radius around a point into a conservative lon/lat search box.
 *
 * latDegrees uses the same MIN_LAT_METERS_PER_DEGREE floor as lowerBoundToEdge, so
 * it never underestimates the latitude span needed to reach `meters` away.
 *
 * lonDegrees solves the exact haversine equation for the worst-case latitude in
 * [p.lat - latDegrees, p.lat + latDegrees] (the one closest to a pole, where a
 * degree of longitude is shortest). The approximation can under-estimate
 * the needed longitude span as soon as the box reaches into higher latitudes
 * than p itself, letting the true nearest edge fall outside the search box.
 */
function safeSearchBox(p: Position, meters: number): Pick<Edge, "minX" | "minY" | "maxX" | "maxY"> {
  const latDegrees = meters / MIN_LAT_METERS_PER_DEGREE;
  const maxAbsLatDeg = Math.min(89.999, Math.max(Math.abs(p[1] - latDegrees), Math.abs(p[1] + latDegrees)));
  const cosProduct = Math.cos(p[1]*DEG_TO_RAD) * Math.cos(maxAbsLatDeg*DEG_TO_RAD);

  let lonDegrees = 180;
  if (cosProduct > 1e-9) {
    const halfAngle = meters / (2 * EARTH_RADIUS_M);
    const sinSqHalfDeltaLambda = Math.sin(halfAngle) ** 2 / cosProduct;
    if (sinSqHalfDeltaLambda >= 1)
      lonDegrees = Math.min(180, (2 * Math.asin(Math.sqrt(sinSqHalfDeltaLambda))) / DEG_TO_RAD);
  }

  return {
    minX: p[0] - lonDegrees,
    minY: p[1] - latDegrees,
    maxX: p[0] + lonDegrees,
    maxY: p[1] + latDegrees,
  };
}


/** Finds the nearest point from p to a shape using vertex fallback and edge pruning. Returns null if nothing beats the upper bound. */
function nearestOnShape(p: Position, shape: Shape, pointDistance: (a: Position, b: Position) => number, upperBound = Infinity): NearestPoint | null {
  let best: NearestPoint | null = null;

  if (shape.edges.length === 0) {
    for (const v of shape.vertices) {
      const d = pointDistance(p, v);
      if (d < upperBound && (best === null || d < best.distance)) {
        best = { distance: d, point: v };
      }
    }
    return best;
  }

  const pLonMetersPerDegree = SPHERE_METERS_PER_DEGREE * Math.cos(p[1]*DEG_TO_RAD);
  const candidates = shape.edgeIndex
    ? shape.edgeIndex.search(safeSearchBox(p, Math.min(upperBound, 20_000_000))) // 20 Mm ≈ half-Earth circumference: caps the bbox so safeSearchBox never overflows ±180°/±90°
    : shape.edges;

  // Each edge first gets a cheap lower-bound test from its bbox in meters.
  // Only the survivors pay for the more expensive point-to-segment refinement.
  for (const edge of candidates) {
    const bound = best === null ? upperBound : best.distance;
    if (lowerBoundToEdge(p, edge, pLonMetersPerDegree) >= bound) continue;
    const nearest = nearestOnSegment(p, edge.a, edge.b, pointDistance);
    if (nearest.distance < (best === null ? upperBound : best.distance)) best = nearest;
  }

  return best;
}

/**
 * Compute geodesic distance in meters between gA and gB, with closest points.
 *
 * JTS gives us a robust planar nearest-point seed and detects all exact touches,
 * overlaps and containments. If the planar answer is not already zero, the final
 * geodesic result is refined by scanning both directions: vertices of A against
 * shape B, then vertices of B against shape A.
 *
 * @param {object} gA GeoJSON Geometry
 * @param {object} gB GeoJSON Geometry
 * @param metric Point-to-point metric: "haversine" (default) or "vincenty".
 */
export function distance(gA: Geometry, gB: Geometry, metric: "haversine" | "vincenty" = "haversine"): DistanceResult {
  const pointDistance = metric === "vincenty" ? distanceVincenty : haversine;

  assertNoAntimeridian(gA);
  assertNoAntimeridian(gB);

  const shapeA = buildShape(gA);
  const shapeB = buildShape(gB);
  assertNoAntimeridianPair(shapeA.vertices, shapeB.vertices);

  const reader = new (GeoJSONReader as unknown as new () => { read(g: Geometry): unknown })();
  type JstsCoord = { x: number; y: number };
  const [n1, n2] = DistanceOp.nearestPoints(reader.read(gA), reader.read(gB)) as [JstsCoord, JstsCoord];
  const p1: Position = [n1.x, n1.y];
  const p2: Position = [n2.x, n2.y];

  if (Math.hypot(n1.x - n2.x, n1.y - n2.y) < 1e-9) { // ~0.1 mm in degrees: below JTS floating-point noise → exact touch
    return { distance: 0, point1: p1, point2: p1 };
  }

  let best: DistanceResult = { distance: pointDistance(p1, p2), point1: p1, point2: p2 };

  for (const v of shapeA.vertices) {
    const nearest = nearestOnShape(v, shapeB, pointDistance, best.distance);
    if (nearest && nearest.distance < best.distance) {
      best = { distance: nearest.distance, point1: v, point2: nearest.point };
    }
  }

  for (const v of shapeB.vertices) {
    const nearest = nearestOnShape(v, shapeA, pointDistance, best.distance);
    if (nearest && nearest.distance < best.distance) {
      best = { distance: nearest.distance, point1: nearest.point, point2: v };
    }
  }

  return { ...best, distance: Math.round(best.distance * 100) / 100 };
}

/** Computes Vincenty distance between two lat/lon points through node-vincenty. */
export function distanceVincenty(a: Position, b: Position) {
  // distVincenty takes lat1, lon1, lat2, lon2
  const result = distVincenty(a[1], a[0], b[1], b[0]);
  if (typeof result !== "object" || result === null) {
    throw new Error("Vincenty formula failed to converge (antipodal or near-antipodal points)");
  }
  return result.distance;
}

export default distance;
