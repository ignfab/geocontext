import turfDistance from "@turf/distance";
import { booleanIntersects } from "@turf/boolean-intersects";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { lineString, point } from "@turf/helpers"
import { polygonToLine } from "@turf/polygon-to-line";
import { pointToLineDistance } from "@turf/point-to-line-distance";
import type { Feature, Geometry, LineString, Point, Position } from "geojson";

type LineFeature = Feature<LineString>;


// Extrait tous les segments d'une géométrie comme LineString features
function extractSegments(g: Geometry): LineFeature[] {
  const segments: LineFeature[] = [];

  function fromCoords(coords: Position[]): void {
    for (let i = 0; i < coords.length - 1; i++)
      segments.push(lineString([coords[i], coords[i + 1]]));
  }

  if (g.type === "LineString") fromCoords(g.coordinates);
  else if (g.type === "MultiLineString") g.coordinates.forEach(fromCoords);
  else if (g.type === "Polygon") g.coordinates.forEach(fromCoords);
  else if (g.type === "MultiPolygon")
    g.coordinates.forEach((rings) => rings.forEach(fromCoords));
  else if (g.type === "GeometryCollection")
    g.geometries.forEach((geometry) => segments.push(...extractSegments(geometry)));

  return segments;
}

// Extrait tous les points d'une géométrie
function extractPoints(g: Geometry): Feature<Point>[] {
  const pts: Feature<Point>[] = [];

  function collect(coords: unknown, depth: number): void {
    if (depth === 0) {
      pts.push(point(coords as Position));
      return;
    }

    if (Array.isArray(coords)) {
      coords.forEach((coord) => collect(coord, depth - 1));
    }
  }

  const depths = {
    Point: 0, MultiPoint: 1,
    LineString: 1, MultiLineString: 2,
    Polygon: 2, MultiPolygon: 3,
  } as const;

  if (g.type === "GeometryCollection") {
    g.geometries.forEach((geometry) => pts.push(...extractPoints(geometry)));
    return pts;
  }

  collect(g.coordinates, depths[g.type]);
  return pts;
}

// Distance min entre un ensemble de points et un ensemble de segments
function pointsToSegmentsMin(pts: Feature<Point>[], segs: LineFeature[], min = Infinity): number {
  for (const pt of pts) {
    for (const seg of segs) {
      const d = pointToLineDistance(pt, seg, { units: "meters" });
      if (d < min) {
        min = d;
      }
    }
  }
  return min;
}

/**
 * Compute geodesic distance in meters between gA and gB.
 *
 * @param {object} gA GeoJSON Geometry
 * @param {object} gB GeoJSON Geometry
 */
export function distance(gA: Geometry, gB: Geometry): number {
  if (gA.type === "Point" && gB.type === "Point") {
    return turfDistance(gA, gB, { units: "meters" });
  }

  if (gB.type === "Point") {
    // Make it so that gA is the Point if either gA or gB is a Point with a recursive call
    return distance(gB, gA);
  }

  if (gA.type === "Point" && gB.type === "LineString") {
    return pointToLineDistance(gA, gB, { units: "meters" });
  }

  if (gA.type === "Point" && gB.type === "Polygon") {
    if (booleanPointInPolygon(gA, gB)) {
      return 0;
    }

    const outline = polygonToLine(gB);

    const lineSegments: LineFeature[] = [];
    const outlineFeatures = outline.type === "FeatureCollection" ? outline.features : [outline];

    for (const feature of outlineFeatures) {
      if (feature.geometry.type === "LineString") {
        lineSegments.push(feature as LineFeature);
      } else {
        feature.geometry.coordinates.forEach((coords) => {
          lineSegments.push(lineString(coords));
        });
      }
    }

    return pointsToSegmentsMin([point(gA.coordinates)], lineSegments);
  }

  try {
    if (booleanIntersects(gA, gB))
      return 0;
  } catch {}

  const ptsA = extractPoints(gA), segsA = extractSegments(gA);
  const ptsB = extractPoints(gB), segsB = extractSegments(gB);

  const r1 = pointsToSegmentsMin(ptsA, segsB);
  const r2 = pointsToSegmentsMin(ptsB, segsA);

  return Number((r1 <= r2 ? r1 : r2).toFixed(3)); // round to 1mm precision
}


export default distance
