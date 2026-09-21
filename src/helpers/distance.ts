import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import DistanceOp from "jsts/org/locationtech/jts/operation/distance/DistanceOp.js";
import IndexedFacetDistance from "jsts/org/locationtech/jts/operation/distance/IndexedFacetDistance.js";
import RelateOp from "jsts/org/locationtech/jts/operation/relate/RelateOp.js";
import type { Geometry, Position } from "geojson";
import { distVincenty } from "node-vincenty";
import { GeometryFactory } from "jsts/org/locationtech/jts/geom.js";
import GeometryLocation from "jsts/org/locationtech/jts/operation/distance/GeometryLocation.js";
import { midpoint } from "@turf/midpoint";

/**
 * Minimal geodesic distance between two GeoJSON geometries, reported in meters
 * together with the closest point found on each side.
 *
 * Antimeridian-crossing geometries (any Polygon ring or LineString segment with
 * |Δlon| > 180°) are rejected: per RFC 7946 they SHOULD be split before being
 * passed here (Polygon → MultiPolygon, LineString → MultiLineString).
 *
 * Edges interpolate linearly in lon/lat, so a "point on the geometry" always
 * means a point on that linear path.
 *
 * The implementation follows three steps:
 * 1. settle the zero-distance cases (touch, crossing, overlap, containment),
 *    skipping the test entirely when the two bounding boxes are apart,
 * 2. seed the search with an exact planar nearest pair, computed in a plane
 *    whose two axes carry comparable ground distances,
 * 3. refine that answer by re-running the planar search in an azimuthal
 *    equidistant projection centered on the current best pair.
 *
 * The search is monotone rather than convergent: step 3 only ever adopts a pair
 * that beats the incumbent (with a 5mm tolerance), so the result is the best of
 * the candidates seen. Every candidate is a genuine (point on A, point on B)
 * pair, hence an upper bound on the true distance.
 *
 * Every planar search goes through an STR-tree of facets, so the cost stays
 * near-linear in the vertex count (see `planarNearestLocations`).
 */

export interface DistanceResult {
  distance: number;
  point1: Position;
  point2: Position;
}

/** Point-to-point metric: spherical great-circle, or geodesic on WGS84. */
export type Metric = "haversine" | "vincenty";

type JstsCoord = { x: number; y: number };

/**
 * A jsts geometry. jsts ships its geometry classes untyped, so the members this
 * file relies on are declared here rather than threaded as `any`.
 */
type JstsGeometry = {
  getEnvelopeInternal(): {
    distance(other: unknown): number;
    getMinY(): number;
    getMaxY(): number;
  };
};

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

/** WGS84 ellipsoid parameters — the ellipsoid `distVincenty` solves on. */
const WGS84_SEMI_MAJOR_M = 6_378_137;
const WGS84_FLATTENING = 1 / 298.257223563;
const WGS84_ECCENTRICITY_SQ = WGS84_FLATTENING * (2 - WGS84_FLATTENING);

/**
 * Refinement stops once a pass moves the answer by less than half a centimeter.
 * Results are reported to the centimeter, so chasing more than that only buys
 * extra planar searches.
 */
const TOLERANCE_M = 5e-3;

const MAX_REFINEMENT_PASSES = 10; // 10 for security, but 3 is generally enough

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
 * Throws if the edge has a longitude jump > 180°, indicating an
 * antimeridian-crossing geometry that SHOULD be split per RFC 7946.
 */
function checkEdge(c1: Position, c2: Position) {
  if (Math.abs(c1[0] - c2[0]) > 180) {
    throw new Error(
      "Antimeridian-crossing geometries SHOULD be split per RFC 7946 " +
      "(Polygon → MultiPolygon, LineString → MultiLineString)",
    );
  }
}

/** Walks every edge of a geometry and rejects the ones crossing the antimeridian. */
function assertNoAntimeridianCrossing(geom: Geometry) {
  function process(g: Geometry): void {
    switch (g.type) {
      case "LineString":
        for (let i = 0; i < g.coordinates.length - 1; i++) checkEdge(g.coordinates[i], g.coordinates[i + 1]);
        break;
      case "MultiLineString":
        for (const line of g.coordinates) {
          for (let i = 0; i < line.length - 1; i++) checkEdge(line[i], line[i + 1]);
        }
        break;
      case "Polygon":
        for (const ring of g.coordinates) {
          for (let i = 0; i < ring.length - 1; i++) checkEdge(ring[i], ring[i + 1]);
        }
        break;
      case "MultiPolygon":
        for (const poly of g.coordinates)
          for (const ring of poly) {
            for (let i = 0; i < ring.length - 1; i++) checkEdge(ring[i], ring[i + 1]);
          }
        break;
      case "GeometryCollection":
        for (const child of g.geometries) process(child);
        break;
    }
  }
  process(geom);
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

  for (
    let step = Math.min(0.5, 0.2 * arcAngle); // initial step: 0.2 of the arc angle (radians), capped at 0.5 t-units (half segment)
    step * segmentLengthMeters > TOLERANCE_M; // stop when step < 5 mm, since distance result is rounded to the cm
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

/**
 * Meridional and prime-vertical radii of curvature at `lat`, in meters.
 *
 * These give the projections below the same local scale as the metric the
 * answer is finally reported in. That match is not cosmetic: candidate edges
 * have to be *ranked* in the metric they are *measured* in, or a nearer edge
 * can lose to a farther one. On WGS84 the meridional and parallel scales
 * differ by ~0.67% at the equator, enough to flip the ranking of two edges
 * that sit within a fraction of a percent of each other.
 */
function curvatureRadii(lat: number, metric: Metric): { meridional: number; primeVertical: number } {
  if (metric === "haversine") return { meridional: EARTH_RADIUS_M, primeVertical: EARTH_RADIUS_M };
  const sinLat = Math.sin(lat * DEG_TO_RAD);
  const w = 1 - WGS84_ECCENTRICITY_SQ * sinLat * sinLat;
  return {
    meridional: WGS84_SEMI_MAJOR_M * (1 - WGS84_ECCENTRICITY_SQ) / (w * Math.sqrt(w)),
    primeVertical: WGS84_SEMI_MAJOR_M / Math.sqrt(w),
  };
}

/**
 * Builds the azimuthal equidistant projection centered at `center`.
 * Returns `project` (lon/lat → [x,y] meters) and `unproject` ([x,y] meters → lon/lat).
 * y points north, x points east from the center.
 */
function makeAzimuthalEquidistant(center: Position, metric: Metric) {
  const phi0 = center[1] * DEG_TO_RAD;
  const lambda0 = center[0] * DEG_TO_RAD;
  const sinPhi0 = Math.sin(phi0);
  const cosPhi0 = Math.cos(phi0);
  const { meridional, primeVertical } = curvatureRadii(center[1], metric);

  const reverseMap = new Map<string, Position>(); // shortcut to unproject for already `project`ed points

  /**
   * Euler's radius of curvature in the normal section of azimuth α, given the
   * unit direction (east, north) = (sin α, cos α) in the tangent plane. Both
   * radii are equal under "haversine", where this collapses to the sphere.
   */
  function radiusInDirection(east: number, north: number): number {
    return 1 / (north * north / meridional + east * east / primeVertical);
  }

  function project(p: Position): Position {
    const phi = p[1] * DEG_TO_RAD;
    const lambda = p[0] * DEG_TO_RAD;
    const cosc = sinPhi0 * Math.sin(phi) + cosPhi0 * Math.cos(phi) * Math.cos(lambda - lambda0);
    const c = Math.acos(Math.min(1, Math.max(-1, cosc)));
    if (c < 1e-12) {
      reverseMap.set("0,0", [p[0], p[1]]);
      return [0, 0];
    }
    const sinc = Math.sin(c);
    const east = Math.cos(phi) * Math.sin(lambda - lambda0) / sinc;
    const north = (cosPhi0 * Math.sin(phi) - sinPhi0 * Math.cos(phi) * Math.cos(lambda - lambda0)) / sinc;
    const rho = radiusInDirection(east, north) * c;
    const projected: Position = [rho * east, rho * north];
    reverseMap.set(`${projected[0]},${projected[1]}`, [p[0], p[1]]);
    return projected;
  }

  function unproject(p: Position): Position {
    const [x, y] = p;
    const rho = Math.sqrt(x * x + y * y);
    if (rho < 1e-6) return center;
    // (x, y) points the same way as (east, north), so the radius `project`
    // scaled by is recoverable here and the round-trip stays exact.
    const c = rho / radiusInDirection(x / rho, y / rho);
    const sinC = Math.sin(c), cosC = Math.cos(c);
    const phi = Math.asin(Math.min(1, Math.max(-1, cosC * sinPhi0 + y * sinC * cosPhi0 / rho)));
    const lambda = lambda0 + Math.atan2(x * sinC, rho * cosPhi0 * cosC - y * sinPhi0 * sinC);
    return [lambda / DEG_TO_RAD, phi / DEG_TO_RAD];
  }

  return { project, unproject, reverseMap };
}

/**
 * Builds the equirectangular projection used for the initial planar seed:
 * longitudes are scaled so that one x unit and one y unit span comparable
 * ground distances around `lat0`. Raw lon/lat degrees are up to 1.4:1
 * anisotropic at French latitudes, which biases the planar nearest pair
 * towards edges that are only nearer *in degrees* and costs the refinement
 * loop a pass to recover.
 *
 * Both axes stay in degree-like units — only their ratio matters here, since
 * every distance is remeasured with the real metric downstream.
 */
function makeEquirectangular(lat0: number, metric: Metric) {
  const { meridional, primeVertical } = curvatureRadii(lat0, metric);
  // Crushing longitudes towards a pole is the right answer, not a fallback:
  // there a degree of longitude really does cover almost no ground. The floor
  // only keeps `unproject` from dividing by zero exactly at ±90°.
  const lonScale = Math.max(primeVertical * Math.cos(lat0 * DEG_TO_RAD) / meridional, 1e-6);
  return {
    project: (p: Position): Position => [p[0] * lonScale, p[1]],
    unproject: (p: Position): Position => [p[0] / lonScale, p[1]],
  };
}

/**
 * Projects a GeoJSON Geometry through `project`, returning a new Geometry of
 * the same type with projected coordinates.
 */
function projectGeometry(geom: Geometry, project: (_: Position) => Position): Geometry {
  const projRing = (ring: Position[]) => ring.map(project);
  switch (geom.type) {
    case "Point":           return { type: "Point", coordinates: project(geom.coordinates) };
    case "MultiPoint":      return { type: "MultiPoint", coordinates: geom.coordinates.map(project) };
    case "LineString":      return { type: "LineString", coordinates: geom.coordinates.map(project) };
    case "MultiLineString": return { type: "MultiLineString", coordinates: geom.coordinates.map(projRing) };
    case "Polygon":         return { type: "Polygon", coordinates: geom.coordinates.map(projRing) };
    case "MultiPolygon":    return { type: "MultiPolygon", coordinates: geom.coordinates.map(poly => poly.map(projRing)) };
    case "GeometryCollection":
      return { type: "GeometryCollection", geometries: geom.geometries.map(g => projectGeometry(g, project)) };
  }
}

/**
 * Exact planar nearest pair between the *boundaries* of two JTS geometries,
 * resolved through an STR-tree of facets.
 *
 * jsts' `DistanceOp` answers the same question with a nested loop over both
 * segment lists, which is quadratic: for two 10 000-vertex polygons that is
 * ~900 ms a pass against ~5 ms here. The trade is that facets carry no notion
 * of interior, so this only finds the nearest pair once the geometries are
 * already known not to intersect — see the `RelateOp.intersects` guard below.
 */
function planarNearestLocations(jstsA: JstsGeometry, jstsB: JstsGeometry): GeometryLocation[] {
  return new IndexedFacetDistance(jstsA).nearestLocations(jstsB) as GeometryLocation[];
}

/**
 * Turns a planar nearest pair into a geodesic one: the planar answer names the
 * two facets involved, and the real distance is then minimized along them with
 * `pointDistance`.
 */
function actualClosestOnGeometryLocation(locA: GeometryLocation, locB: GeometryLocation, pointDistance: (a: Position, b: Position) => number, unproject: (_: Position) => Position, reverseMap?: Map<string, Position>): DistanceResult {
  function unproj(c: JstsCoord): Position {
    return reverseMap?.get(`${c.x},${c.y}`) ?? unproject([c.x, c.y]);
  }

  function getSegment(loc: GeometryLocation) {
    const coords: JstsCoord[] = loc.getGeometryComponent().getCoordinates();
    if (coords.length > 1) {
      const idx: number = loc.getSegmentIndex();
      return { start: unproj(coords[idx]), stop: unproj(coords[idx + 1]) };
    }
  }

  // When the *query* side of an indexed search resolves to a bare Point facet,
  // jsts tags that location with the base geometry's component and start index
  // instead of its own (FacetSequence.nearestLocations, `isPointOther` branch),
  // so both locations report the same component object. Only the coordinate is
  // trustworthy there — which is all a vertex has anyway.
  const mislabeledPointSide = locA.getGeometryComponent() === locB.getGeometryComponent();
  const segA = getSegment(locA);
  const segB = mislabeledPointSide ? undefined : getSegment(locB);
  const candidates = [];
  if (segA) candidates.push({ point: unproj(locB.getCoordinate() as JstsCoord), seg: segA, rev: true });
  if (segB) candidates.push({ point: unproj(locA.getCoordinate() as JstsCoord), seg: segB, rev: false });
  if (candidates.length == 0) { // both sides are isolated points
    const pA = unproj(locA.getCoordinate() as JstsCoord);
    const pB = unproj(locB.getCoordinate() as JstsCoord);
    return { distance: pointDistance(pA, pB), point1: pA, point2: pB };
  }

  let best: DistanceResult = { distance: Infinity, point1: [0, 0], point2: [0, 0] };
  for (const { point, seg, rev } of candidates) {
    const nearest = nearestOnSegment(point, seg.start, seg.stop, pointDistance);
    if (nearest.distance < best.distance) {
      const [point1, point2] = rev ? [nearest.point, point] : [point, nearest.point];
      best = { distance: nearest.distance, point1, point2 };
    }
  }
  return best;
}

/**
 * Compute geodesic distance in meters between gA and gB, with closest points.
 *
 * @param {object} gA GeoJSON Geometry
 * @param {object} gB GeoJSON Geometry
 * @param metric Point-to-point metric: "haversine" (default) or "vincenty".
 */
export function distance(gA: Geometry, gB: Geometry, metric: Metric = "haversine"): DistanceResult {
  const pointDistance = metric === "vincenty" ? distanceVincenty : haversine;
  if (gA.type == "Point" && gB.type == "Point") // fast-path for the common case
    return { point1: gA.coordinates, point2: gB.coordinates, distance: Math.round(pointDistance(gA.coordinates, gB.coordinates)*100)/100 };

  assertNoAntimeridianCrossing(gA);
  assertNoAntimeridianCrossing(gB);

  const reader = new GeoJSONReader(new GeometryFactory());
  const jstsA = reader.read(gA);
  const jstsB = reader.read(gB);
  const envA = jstsA.getEnvelopeInternal();
  const envB = jstsB.getEnvelopeInternal();

  // Check whether the distance is 0.
  // If an intersection is detected via the cheaper `RelateOp.intersects`,
  // use the costlier DistanceOp to retrieve the intersection point.
  if (envA.distance(envB) === 0 && RelateOp.intersects(jstsA, jstsB)) {
    const [n1] = new DistanceOp(jstsA, jstsB).nearestPoints();
    return { distance: 0, point1: [n1.x, n1.y], point2: [n1.x, n1.y] };
  }

  // Seed on the exact planar nearest pair. `actualClosestOnGeometryLocation`
  // already minimizes over both facets of that pair, so the mirrored ordering
  // yields the same distance and needs no second evaluation.
  const seedLat = (Math.min(envA.getMinY(), envB.getMinY()) + Math.max(envA.getMaxY(), envB.getMaxY())) / 2;
  const seed = makeEquirectangular(seedLat, metric);
  const seedLocations = planarNearestLocations(
    reader.read(projectGeometry(gA, seed.project)),
    reader.read(projectGeometry(gB, seed.project)),
  );
  let best = actualClosestOnGeometryLocation(seedLocations[0], seedLocations[1], pointDistance, seed.unproject);

  // Re-run the planar search in an equidistant azimuthal projection centered on
  // the current best pair, keeping whichever pair measures shorter.
  let converged = false;
  for (let i = 0; i < MAX_REFINEMENT_PASSES && !converged; i++) {
    const center = midpoint(best.point1, best.point2).geometry.coordinates;
    const { project, unproject, reverseMap } = makeAzimuthalEquidistant(center, metric);
    const projA = projectGeometry(gA, project);
    const projB = projectGeometry(gB, project);
    const [newLocA, newLocB] = planarNearestLocations(reader.read(projA), reader.read(projB));
    const newBest = actualClosestOnGeometryLocation(newLocA, newLocB, pointDistance, unproject, reverseMap);
    if (newBest.distance > best.distance + TOLERANCE_M) {
      // This projection has nothing better to offer, so stop and keep the
      // incumbent. Not a fixed point, despite the flag: unlike the seed's
      // equirectangular plane, which is affine in lon/lat and therefore maps
      // edges to edges, a straight line in the azimuthal plane is a geodesic
      // rather than the lon/lat-linear edge it stands for. On edges spanning
      // thousands of kilometres the two curves separate far enough that the
      // planar pair can name a point off the geometry, and this branch is what
      // keeps such a pair from being adopted.
      converged = true;
      break;
    }
    converged = best.distance - newBest.distance < TOLERANCE_M;
    best = newBest;
  }
  if (!converged) {
    throw new Error("Convergence error in the distance algorithm: cannot compute the distance.");
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
