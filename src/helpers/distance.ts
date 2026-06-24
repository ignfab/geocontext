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



// The following code is taken from node-vincenty (with minor changes and typescript annotations)

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Vincenty Direct Solution of Geodesics on the Ellipsoid (c) Chris Veness 2005-2012              */
/*                                                                                                */
/* from: Vincenty direct formula - T Vincenty, "Direct and Inverse Solutions of Geodesics on the  */
/*       Ellipsoid with application of nested equations", Survey Review, vol XXII no 176, 1975    */
/*       http://www.ngs.noaa.gov/PUBS_LIB/inverse.pdf                                             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

function toRad(Value : number) {
  /** Converts numeric degrees to radians */
  return Value * Math.PI / 180;
}

/**
 * Compute the geodesic distance in meters between two points, using Vincenty formula.
 *
 * @param {object} lat1 latitude of the first point
 * @param {object} lon1 longitude of the first point
 * @param {object} lat2 latitude of the second point
 * @param {object} lon2 longitude of the second point
 */
export function distanceVincenty(lat1 : number, lon1 : number, lat2 : number, lon2 : number) {
  var a = 6378137,
    b = 6356752.314245,
    f = 1 / 298.257223563;  // WGS-84 ellipsoid params

  var L = toRad(( lon2 - lon1 ));
  var U1 = Math.atan(( 1 - f ) * Math.tan( toRad(lat1) ));
  var U2 = Math.atan(( 1 - f ) * Math.tan( toRad(lat2) ));
  var sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  var sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  var lambda = L, lambdaP, iterLimit = 100;
  do {
    var sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
    var sinSigma = Math.sqrt((cosU2*sinLambda) * (cosU2*sinLambda) +
      (cosU1*sinU2-sinU1*cosU2*cosLambda) * (cosU1*sinU2-sinU1*cosU2*cosLambda));
    if (sinSigma==0) {
      // var result = { distance: 0, initialBearing: 0, finalBearing: 0 };
      return 0;
    };  // co-incident points
    var cosSigma = sinU1*sinU2 + cosU1*cosU2*cosLambda;
    var sigma = Math.atan2(sinSigma, cosSigma);
    var sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    var cosSqAlpha = 1 - sinAlpha*sinAlpha;
    var cos2SigmaM = cosSigma - 2*sinU1*sinU2/cosSqAlpha;
    if (isNaN(cos2SigmaM)) cos2SigmaM = 0;  // equatorial line: cosSqAlpha=0 (§6)
    var C = f/16*cosSqAlpha*(4+f*(4-3*cosSqAlpha));
    lambdaP = lambda;
    lambda = L + (1-C) * f * sinAlpha *
      (sigma + C*sinSigma*(cos2SigmaM+C*cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)));
  } while (Math.abs(lambda-lambdaP) > 1e-12 && --iterLimit>0);

  if (iterLimit==0) return NaN  // formula failed to converge

  var uSq = cosSqAlpha * (a*a - b*b) / (b*b);
  var A = 1 + uSq/16384*(4096+uSq*(-768+uSq*(320-175*uSq)));
  var B = uSq/1024 * (256+uSq*(-128+uSq*(74-47*uSq)));
  var deltaSigma = B*sinSigma*(cos2SigmaM+B/4*(cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)-
    B/6*cos2SigmaM*(-3+4*sinSigma*sinSigma)*(-3+4*cos2SigmaM*cos2SigmaM)));
  var s = b*A*(sigma-deltaSigma);

  s = Number(s.toFixed(3)); // round to 1mm precision

  // // note: to return initial/final bearings in addition to distance, use something like:
  // var fwdAz = Math.atan2(cosU2*sinLambda,  cosU1*sinU2-sinU1*cosU2*cosLambda);
  // var revAz = Math.atan2(cosU1*sinLambda, -sinU1*cosU2+cosU1*sinU2*cosLambda);
  // var result = { distance: s, initialBearing: toDeg(fwdAz), finalBearing: toDeg(revAz) };

  return s;
}

export default distance
