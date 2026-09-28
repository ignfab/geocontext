import { centroid } from "@turf/centroid";
import { bbox } from "@turf/bbox";
import turfLength from "@turf/length";
import { area } from "@turf/area";
import { intersect } from "@turf/intersect";
import { circle } from "@turf/circle";
import { bboxPolygon } from "@turf/bbox-polygon";
import type { Geometry, LineString, MultiLineString, MultiPolygon, Point, Polygon, Position } from "geojson";
import distance from "../helpers/distance.js";
import { feature, featureCollection } from "@turf/helpers";
import { getSpatialFilter } from "./spatialFilter.js";
import type {
  SpatialFilterInput,
  SpatialExtraOptions,
  SpatialFilter,
} from "./schema.js";
import { bboxClip } from "@turf/bbox-clip";

export type FeatureCollectionPostProcessInput = {
    typename: string,
    spatial_extras: SpatialExtraOptions[];
  } & SpatialFilterInput;

/** Extract the geometry of the unique spatial filter */
function spatialFilterToGeometry(spatialFilter: SpatialFilter, resolvedGeometryRef?: Geometry) : Geometry {
  switch (spatialFilter.operator) {
    case "bbox": {
      return bboxPolygon([spatialFilter.west, spatialFilter.south, spatialFilter.east, spatialFilter.north]).geometry;
    }
    case "dwithin_point" : {
      const center = [spatialFilter.lon, spatialFilter.lat];
      // Approximate the form of the filter using @turf/circle with 64 vertices by default
      return circle(center, spatialFilter.distance_m, { units: "meters" }).geometry;
    }
    case "intersects_point": {
      const point = [spatialFilter.lon, spatialFilter.lat];
      return { type: "Point", coordinates: point };
    }
    case "intersects_feature":
    case "travel_time":
      if (!resolvedGeometryRef) {
        throw new Error(`Le filtre spatial \`${spatialFilter.operator}\` exige la résolution préalable de la géométrie de référence.`);
      }
      return resolvedGeometryRef;
    default: // Make a compile-time error if a filter is missing from the switch
      const noFilter: never = spatialFilter;
      throw new Error(`Unhandled filter case: ${noFilter}`)
  }
}

function spatialFilterToCentroid(spatialFilter: SpatialFilter, resolvedGeometryRef?: Geometry) : Point {
  switch (spatialFilter.operator) {
    case "dwithin_point" :
    case "travel_time":
    case "intersects_point": {
      return { type: "Point", coordinates: [spatialFilter.lon, spatialFilter.lat] };
    }
    case "intersects_feature":
    case "bbox":
      return centroid(spatialFilterToGeometry(spatialFilter, resolvedGeometryRef)).geometry;
    default: // Make a compile-time error if a filter is missing from the switch
      const noFilter: never = spatialFilter;
      throw new Error(`Unhandled filter case: ${noFilter}`)
  }
}

/** Accepts any geometry and returns it as a Polygon or MultiPolygon, filtering
 * all 0D (point) and 1D (line) sub-geometries out.
 *
 * The polygons of a GeometryCollection are concatenated, not unioned: measures
 * sum their parts, overlaps included, like JTS `GeometryCollection.getArea()`.
 */
function geometryToPolygons(geom: Geometry) : Polygon | MultiPolygon | null {
  switch(geom.type) {
    case "Polygon":
    case "MultiPolygon":
      return dropEmptyRings(geom);
    case "GeometryCollection": {
      const subGeometries = geom.geometries.map(geometryToPolygons).filter(x => x !== null);
      if (subGeometries.length == 0) {
        return null;
      } else if (subGeometries.length == 1) {
        return subGeometries[0];
      } else {
        const coordinates : Position[][][] = []
        subGeometries.forEach(element => {
          if (element.type == "Polygon") {
            coordinates.push(element.coordinates);
          }
          else {
            coordinates.push(...element.coordinates);
          }
        });
        return { type: "MultiPolygon", coordinates};
      }
    }
    default:
      return null;
  }
}

/** Accepts any geometry and returns its linear (1D) parts as a LineString or
 * MultiLineString, dropping empty lines, points and polygons. Returns null when
 * nothing linear remains.
 */
function geometryToLines(geom: Geometry) : LineString | MultiLineString | null {
  switch (geom.type) {
    case "LineString":
      return geom.coordinates.length >= 2 ? geom : null;
    case "MultiLineString": {
      const coordinates = geom.coordinates.filter((line) => line.length >= 2);
      return coordinates.length == 0 ? null : { type: "MultiLineString", coordinates };
    }
    case "GeometryCollection": {
      const coordinates = geom.geometries
        .map(geometryToLines)
        .filter((lines) => lines !== null)
        .flatMap((lines) => lines.type == "LineString" ? [lines.coordinates] : lines.coordinates);
      return coordinates.length == 0 ? null : { type: "MultiLineString", coordinates };
    }
    default:
      return null;
  }
}

/** True when `geometry` is a GeoJSON geometry holding at least one finite position. */
function isComputableGeometry(geometry: unknown) : geometry is Geometry {
  try {
    return bbox(geometry as Geometry).every(Number.isFinite);
  } catch {
    return false;
  }
}

type SpatialContext = {
  filterCentroid: Point | null,
  filterPolygons: Polygon | MultiPolygon | null
}

export function prepareSpatialContext(input: FeatureCollectionPostProcessInput, resolvedGeometryRef?: Geometry) : SpatialContext {
  const requires_distance_to_filter = input.spatial_extras.includes("distance_to_filter");
  const requires_intersection_area = input.spatial_extras.includes("intersection_area");

  const context : SpatialContext = {
    filterCentroid: null,
    filterPolygons: null,
  };

  if (!requires_distance_to_filter && !requires_intersection_area) {
    // short-circuit: don't compute the spatial filter
    return context;
  }

  // The input schema guarantees a spatial filter when a filter-dependent extra is
  // requested (`assertSpatialExtraSpatialFilterConsistency`), hence the final "!".
  // In case of internal error, the associated spatial_extra will be set to null.
  const spatialFilter = getSpatialFilter(input)!;

  if (requires_distance_to_filter) {
    try {
      context.filterCentroid = spatialFilterToCentroid(spatialFilter, resolvedGeometryRef);
    } catch {}
  }

  if (requires_intersection_area) {
    try {
      context.filterPolygons = geometryToPolygons(spatialFilterToGeometry(spatialFilter, resolvedGeometryRef));
    } catch {}
  }

  return context;
}

/** Strip the empty rings `@turf/bbox-clip` emits for parts lying outside the box.
 *
 * A fully-clipped-away Polygon comes back as `{ coordinates: [] }` and a
 * MultiPolygon keeps one empty entry per discarded part (`[[...], []]`), both of
 * which are invalid GeoJSON. Returns null when nothing areal survives.
 */
export function dropEmptyRings(geom: Geometry) : Polygon | MultiPolygon | null {
  if (geom.type == "Polygon") {
    return geom.coordinates.length == 0 ? null : geom;
  }
  if (geom.type == "MultiPolygon") {
    const coordinates = geom.coordinates.filter((polygon) => polygon.length > 0);
    return coordinates.length == 0 ? null : { type: "MultiPolygon", coordinates };
  }
  // `bboxClip` is typed over every geometry it accepts, but the caller only ever
  // passes polygons, so a non-areal result means nothing areal survived.
  return null;
}

/** Return the area (m²) of the part of a geometry lying inside a spatial filter.
 *
 * null when it cannot be computed: the geometry or the filter has no areal part,
 * or the filter geometry could not be prepared. 0 only when both are areal and
 * do not overlap.
 */
function intersectionAreaWithSpatialFilter(geom: Geometry, spatialFilter: SpatialFilter, filterPolygons: Polygon | MultiPolygon | null) : number | null {
  const geo = geometryToPolygons(geom);
  if (!geo) {
    return null; // non-areal feature
  }
  switch (spatialFilter.operator) {
    case "intersects_point":
      return null; // non-areal filter (already rejected by the input schema)
    // Note: `dwithin_point` matches a feature as soon as any part of it
    // lies within `distance_m`, so the intersection is needed even for it.
    case "dwithin_point":
    case "intersects_feature":
    case "travel_time": {
      if (!filterPolygons) return null; // non-areal filter, or filter preparation failed
      // Whatever lies outside the feature's bbox cannot intersect it, so clipping the
      // reference first leaves the result unchanged while polyclip only ever processes
      // the neighbouring vertices.
      const clippedFilter = dropEmptyRings(bboxClip(filterPolygons, bbox(geo)).geometry);
      if (!clippedFilter) return 0; // no overlap
      const inter = intersect(featureCollection([feature(clippedFilter), feature(geo)]));
      return inter == null ? 0 : area(inter.geometry);
    }
    case "bbox": {
      const clipped = dropEmptyRings(bboxClip(geo, [spatialFilter.west, spatialFilter.south, spatialFilter.east, spatialFilter.north]).geometry);
      return clipped == null ? 0 : area(clipped);
    }
    default: // Make a compile-time error if a filter is missing from the switch
      const noFilter: never = spatialFilter;
      throw new Error(`Unhandled filter case: ${noFilter}`)
  }
}

/** Compute the requested `spatial_extras` of one returned feature.
 *
 * Contract shared by every extra:
 * 1. A mismatch that is knowable before the main WFS query (e.g. `area` on a layer
 *    whose geometry format is linear) is rejected upstream with an error, never here.
 * 2. A value that cannot be computed for this feature (missing or empty geometry,
 *    no part of the required dimension, non-areal filter, internal failure) is `null`.
 * 3. Otherwise the value is the computed one, `0` included: `0` always means the
 *    computation ran (e.g. no overlap with the filter), never "not computable".
 */
export function deriveFromGeometry(geometry: unknown, input: FeatureCollectionPostProcessInput, context: SpatialContext) {
  const spatial_extras = input.spatial_extras;

  const ret : Record<string, unknown> = {};

  if (spatial_extras.length === 0) {
    return ret;
  }

  if (!isComputableGeometry(geometry)) {
    // Contract case 2: nothing can be computed on a missing or empty geometry.
    for (const extra of spatial_extras) {
      ret[extra] = null;
    }
    return ret;
  }
  const geo = geometry;

  if (spatial_extras.includes("centroid")) {
    try {
      const centr = centroid(geo).geometry.coordinates;
      ret.centroid = {
        lon: centr[0],
        lat: centr[1],
      };
    } catch {
      ret.centroid = null;
    }
  }

  if (spatial_extras.includes("bbox")) {
    try {
      const bb : GeoJSON.BBox = bbox(geo);
      ret.bbox = bb;
    } catch {
      ret.bbox = null;
    }
  }

  if (spatial_extras.includes("length")) {
    try {
      const geoAsLines = geometryToLines(geo);
      ret.length = geoAsLines ? turfLength(feature(geoAsLines), { units: "meters" }) : null;
    } catch {
      ret.length = null;
    }
  }

  if (spatial_extras.includes("area")) {
    try {
      const geoAsPolygons = geometryToPolygons(geo);
      ret.area = geoAsPolygons ? area(geoAsPolygons) : null;
    } catch {
      ret.area = null;
    }
  }

  const requires_distance_to_filter = spatial_extras.includes("distance_to_filter");
  const requires_intersection_area = spatial_extras.includes("intersection_area");

  if (!requires_distance_to_filter && !requires_intersection_area) {
    // short-circuit: don't compute the spatial filter
    return ret;
  }

  // The input schema guarantees a spatial filter when a filter-dependent extra is
  // requested (`assertSpatialExtraSpatialFilterConsistency`), hence the final "!".
  // In case of internal error, the associated spatial_extra will be set to null.
  const spatialFilter = getSpatialFilter(input)!;

  if (requires_distance_to_filter) {
    try {
      const filterCentroid = context.filterCentroid!;
      ret.distance_to_filter = distance(geo, filterCentroid);
    } catch {
      ret.distance_to_filter = null;
    }
  }

  if (requires_intersection_area) {
    try {
      ret.intersection_area = intersectionAreaWithSpatialFilter(geo, spatialFilter, context.filterPolygons);
    } catch {
      ret.intersection_area = null;
    }
  }

  return ret;
}
