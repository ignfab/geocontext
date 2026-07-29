import turfDistance from "@turf/distance";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { flatten } from "@turf/flatten";
import lineToPolygon from "@turf/line-to-polygon";
import { lineIntersect } from "@turf/line-intersect";
import { nearestPointOnLine } from "@turf/nearest-point-on-line";
import polygonToLine from "@turf/polygon-to-line";
import { fixGeoJson } from "antimeridian-ts";
import type {
  Geometry,
  GeometryCollection,
  LineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";
import { distVincenty } from "node-vincenty";
import { rewind } from "@turf/rewind";

type FlattenedGeometry = Point | LineString | Polygon;

export interface DistanceResult {
  distance: number; // meters
  point1: Position;
  point2: Position;
}

// close the open polygon rings returned by fixGeoJSON
function closePolygonRings(g: Polygon): Polygon;
function closePolygonRings(g: MultiPolygon): MultiPolygon;
function closePolygonRings<T extends Geometry>(g: T): T;
function closePolygonRings(g: Geometry): Geometry {
  if (g.type === "Polygon") {
    const rebuilt = lineToPolygon(polygonToLine(g), { autoComplete: true }).geometry;
    return rebuilt.type === "Polygon" ? rebuilt : g;
  }
  if (g.type === "MultiPolygon") {
    // Rebuild each polygon independently to preserve MultiPolygon structure.
    const coordinates = g.coordinates.map(polyCoordinates => {
      return closePolygonRings({ type: "Polygon", coordinates: polyCoordinates }).coordinates;
    });
    return {
      type: "MultiPolygon",
      coordinates,
    };
  }
  return g;
}

function handleAntimeridian(g : Exclude<Geometry, GeometryCollection | Point | MultiPoint>) {
  // Use fixGeoJson with fixWinding to preserve polygon holes
  // Use great-circle antimeridian splitting because closest-point and
  // distance computations below use spherical geometry.
  // antimeridian-ts may mutate ring arrays in some code paths; protect callers' geometry.
  const fixed = fixGeoJson(rewind(structuredClone(g)), { fixWinding: true, greatCircle: true }) as Exclude<Geometry, GeometryCollection | Point | MultiPoint>;
  return closePolygonRings(fixed);
}

function lineCrossesAntimeridian(coords: Position[]): boolean {
  for (let i = 0; i < coords.length - 1; i++) {
    if (Math.abs(coords[i + 1][0] - coords[i][0]) > 180) {
      return true;
    }
  }
  return false;
}

function geometryCrossesAntimeridian(g: Geometry): boolean {
  switch (g.type) {
    case "LineString":
      return lineCrossesAntimeridian(g.coordinates);
    case "MultiLineString":
    case "Polygon":
      return g.coordinates.some(lineCrossesAntimeridian);
    case "MultiPolygon":
      return g.coordinates.some(poly => poly.some(lineCrossesAntimeridian));
    default:
      // This function is not called with GeometryCollection
      return false;
  }
}

function cutAntimeridian(g: Geometry): Geometry {
  switch (g.type) {
    case "GeometryCollection": {
      // Recursively handle GeometryCollection to circumvent a bug in 
      return {
        ...g,
        geometries: g.geometries.map(cutAntimeridian),
      };
    }
    case "Point":
    case "MultiPoint":
      return g;
    default: {
      if (!geometryCrossesAntimeridian(g)) {
        return g;
      }
      return handleAntimeridian(g);
    }
  }
}

export function splitIntoFlatGeometries(g: Geometry): { points: Point[]; lineStrings: LineString[]; polygons: Polygon[] } {
  const normalized = cutAntimeridian(g);
  const flat: FlattenedGeometry[] = (flatten(normalized).features ?? []).map(f => f.geometry);
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
  const intersections = lineIntersect(lineA, lineB);
  if (intersections.features.length > 0) {
    return intersections.features[0].geometry.coordinates;
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
  // fast-track for point-to-point distance
  if (gA.type === "Point" && gB.type === "Point")
    return { distance: roundDistance(turfDistance(gA, gB)), point1: gA.coordinates, point2: gB.coordinates };

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

export function distanceVincenty(lat1 : number, lon1 : number, lat2 : number, lon2 : number) {
  return distVincenty(lat1, lon1, lat2, lon2).distance;
}

export default distance
