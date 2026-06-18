import turfDistance from "@turf/distance";
import { booleanIntersects } from "@turf/boolean-intersects";
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

export function splitIntoPointsAndLineStrings(g : Geometry): { points: Point[]; lineStrings: LineString[] } {
  const flat : FlattenedGeometry[] = (flatten(feature(g)).features ?? []).map(f => f.geometry);
  const points: Point[] = [];
  const lineStrings: LineString[] = [];
  for (const g of flat) {
    if (g.type === "Point") {
      points.push(g as Point);
    } else if (g.type === "LineString") {
      lineStrings.push(g);
      // Extract vertices as points
      for (const coord of g.coordinates) {
        points.push({ type: "Point", coordinates: coord });
      }
    } else if (g.type === "Polygon") {
      // Convert each ring to a linestring
      for (const ring of g.coordinates) {
        lineStrings.push({ type: "LineString", coordinates: ring });
        // Extract vertices as points
        for (const coord of ring) {
          points.push({ type: "Point", coordinates: coord });
        }
      }
    }
  }
  return { points, lineStrings };
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

  if (booleanIntersects(gA, gB)) return { distance: 0, point1: [0, 0], point2: [0, 0] };

  const { points: pointsA, lineStrings: segA } = splitIntoPointsAndLineStrings(gA);
  const { points: pointsB, lineStrings: segB } = splitIntoPointsAndLineStrings(gB);

  const bestDistanceCandidates = [
    pointsToPointsMin(pointsA, pointsB),
    ...(segB.length > 0 ? [pointsToSegmentsMin(pointsA, segB)] : []),
    ...(segA.length > 0 ? [pointsToSegmentsMin(pointsB, segA)] : []),
  ];
  const best = bestDistanceCandidates.reduce((a, b) => a.distance < b.distance ? a : b);
  return { ...best, distance: roundDistance(best.distance) };
}


export default distance
