import turfDistance from "@turf/distance";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { flatten } from "@turf/flatten";
import { feature } from "@turf/helpers";
import { nearestPointOnLine } from "@turf/nearest-point-on-line";
import type {
  Geometry,
  LineString,
  Point,
  Polygon,
  Position,
} from "geojson";

type FlattenedGeometry = Point | LineString | Polygon;

export interface DistanceResult {
  distance: number; // meters
  point1: Position;
  point2: Position;
}

export function splitIntoFlatGeometries(g: Geometry): { points: Point[]; lineStrings: LineString[]; polygons: Polygon[] } {
  const flat: FlattenedGeometry[] = (flatten(feature(g)).features ?? []).map(f => f.geometry);
  const points: Point[] = [];
  const lineStrings: LineString[] = [];
  const polygons: Polygon[] = [];
  
  for (const geom of flat) {
    if (geom.type === "Point") {
      points.push(geom as Point);
    } else if (geom.type === "LineString") {
      lineStrings.push(geom);
      // Extract vertices as points
      for (const coord of geom.coordinates) {
        points.push({ type: "Point", coordinates: coord });
      }
    } else if (geom.type === "Polygon") {
      polygons.push(geom);
      // Extract rings as linestrings for crossing detection
      for (const ring of geom.coordinates) {
        lineStrings.push({ type: "LineString", coordinates: ring });
      }
      // Extract vertices as points
      for (const ring of geom.coordinates) {
        for (const coord of ring) {
          points.push({ type: "Point", coordinates: coord });
        }
      }
    }
  }
  return { points, lineStrings, polygons };
}

// Check if two line segments intersect in the planar (lon/lat) space
function planarIntersection(a1: Position, a2: Position, b1: Position, b2: Position): Position | null {
  const d1x = a2[0] - a1[0], d1y = a2[1] - a1[1];
  const d2x = b2[0] - b1[0], d2y = b2[1] - b1[1];
  const denom = d1x * d2y - d1y * d2x;
  
  if (Math.abs(denom) < 1e-14) return null; // parallel or colinear
  
  const dx = b1[0] - a1[0], dy = b1[1] - a1[1];
  const t = (dx * d2y - dy * d2x) / denom;
  const u = (dx * d1y - dy * d1x) / denom;
  
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return [a1[0] + t * d1x, a1[1] + t * d1y];
  }
  return null;
}

// minimal distance between a list of points and a list of segments
function pointsToSegmentsMin(pointGeoms: Point[], segmentGeoms: LineString[]): DistanceResult {
  let minDist = Infinity;
  let bestPoint1: Position = [0, 0];
  let bestPoint2: Position = [0, 0];
  
  for (const pt of pointGeoms) {
    for (const line of segmentGeoms) {
      const nearest = nearestPointOnLine(line, pt.coordinates);
      const d = nearest.properties.pointDistance;
      if (d < minDist) {
        minDist = d;
        bestPoint1 = pt.coordinates;
        bestPoint2 = nearest.geometry.coordinates;
      }
    }
  }
  
  return { distance: minDist, point1: bestPoint1, point2: bestPoint2 };
}

// Check for line-line segment intersections
function lineToLineIntersection(lineA: LineString, lineB: LineString): Position | null {
  const coordsA = lineA.coordinates;
  const coordsB = lineB.coordinates;
  
  for (let i = 0; i < coordsA.length - 1; i++) {
    for (let j = 0; j < coordsB.length - 1; j++) {
      const intersection = planarIntersection(
        coordsA[i], coordsA[i + 1],
        coordsB[j], coordsB[j + 1]
      );
      if (intersection) return intersection;
    }
  }
  return null;
}

function pointsToPointsMin(a: Point[], b: Point[]): DistanceResult {
  let minDist = Infinity;
  let bestPoint1: Position = [0, 0];
  let bestPoint2: Position = [0, 0];
  
  for (const ptA of a) {
    for (const ptB of b) {
      const d = turfDistance(ptA, ptB);
      if (d < minDist) {
        minDist = d;
        bestPoint1 = ptA.coordinates;
        bestPoint2 = ptB.coordinates;
      }
    }
  }
  
  return { distance: minDist, point1: bestPoint1, point2: bestPoint2 };
}

const roundDistance = (km: number) => Number((km * 1000).toFixed(2));

/**
 * Compute geodesic distance in meters between gA and gB, with closest points.
 *
 * @param {object} gA GeoJSON Geometry
 * @param {object} gB GeoJSON Geometry
 */
export function distance(gA: Geometry, gB: Geometry): DistanceResult {
  // Normalize: ensure gA is the Point when one input is a Point
  if (gB.type === "Point" && gA.type !== "Point") {
    const r = distance(gB, gA);
    return { distance: r.distance, point1: r.point2, point2: r.point1 };
  }

  if (gA.type === "Point" && gB.type === "Point")
    return { distance: roundDistance(turfDistance(gA, gB)), point1: gA.coordinates, point2: gB.coordinates };

  if (gA.type === "Point" && gB.type === "LineString") {
    const nearest = nearestPointOnLine(gB, gA.coordinates);
    return { distance: roundDistance(nearest.properties.pointDistance), point1: gA.coordinates, point2: nearest.geometry.coordinates };
  }

  const { points: pointsA, lineStrings: segA, polygons: polysA } = splitIntoFlatGeometries(gA);
  const { points: pointsB, lineStrings: segB, polygons: polysB } = splitIntoFlatGeometries(gB);

  // Check for point-in-polygon containment (both directions)
  for (const [pts, polys] of [[pointsA, polysB], [pointsB, polysA]] as const) {
    for (const pt of pts) {
      for (const poly of polys) {
        if (booleanPointInPolygon(pt.coordinates, poly)) {
          return { distance: 0, point1: pt.coordinates, point2: pt.coordinates };
        }
      }
    }
  }

  // Check for line-line segment intersections
  for (const lineA of segA) {
    for (const lineB of segB) {
      const intersection = lineToLineIntersection(lineA, lineB);
      if (intersection) {
        return { distance: 0, point1: intersection, point2: intersection };
      }
    }
  }

  // Main distance computation
  const bestDistanceCandidates = [
    pointsToPointsMin(pointsA, pointsB),
    ...(segB.length > 0 ? [pointsToSegmentsMin(pointsA, segB)] : []),
    ...(segA.length > 0 ? [pointsToSegmentsMin(pointsB, segA)] : []),
  ];
  const best = bestDistanceCandidates.reduce((a, b) => a.distance < b.distance ? a : b);
  return { ...best, distance: roundDistance(best.distance) };
}


export default distance
