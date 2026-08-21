import { centroid } from "@turf/centroid";
import { bbox } from "@turf/bbox";
import turfLength from "@turf/length";
import { area } from "@turf/area";
import { intersect } from "@turf/intersect";
import { circle } from "@turf/circle";
import { bboxPolygon } from "@turf/bbox-polygon";
import { Geometry, MultiPolygon, Point, Polygon, Position } from "geojson";
import distance from "../helpers/distance.js";
import { feature, featureCollection } from "@turf/helpers";
import { getSpatialFilter } from "./spatialFilter.js";
import { GpfGetFeaturesInput, SpatialFilter } from "./schema.js";
import { bboxClip } from "@turf/bbox-clip";

export type FeatureCollectionPostProcessInput = Omit<GpfGetFeaturesInput, "limit">;

/** Extract the geometry of the unique spatial filter, if any, otherwise return undefined */
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
      return resolvedGeometryRef!;
    default: // Make a compile-time error if a filter is missing from the switch
      const noFilter: never = spatialFilter;
      throw new Error(`Unhandled filter case: ${noFilter}`)
  }
}

function spatialFilterToCentroid(spatialFilter: SpatialFilter, resolvedGeometryRef?: Geometry) : Point {
  switch (spatialFilter.operator) {
    case "dwithin_point" :
    case "intersects_point": {
      return { type: "Point", coordinates: [spatialFilter.lon, spatialFilter.lat] };
    }
    case "intersects_feature":
    case "travel_time":
    case "bbox":
      return centroid(spatialFilterToGeometry(spatialFilter, resolvedGeometryRef)).geometry;
    default: // Make a compile-time error if a filter is missing from the switch
      const noFilter: never = spatialFilter;
      throw new Error(`Unhandled filter case: ${noFilter}`)
  }
}

/** Accepts any geometry and returns it as a Polygon or MultiPolygon, filtering
 * all 0D (point) and 1D (line) sub-geometries out.
 */
function geometryToPolygons(geom: Geometry) : Polygon | MultiPolygon | null {
  switch(geom.type) {
    case "Polygon":
      return geom;
    case "MultiPolygon":
      return geom.coordinates.length == 0 ? null : geom.coordinates.length > 1 ? geom :
      { type: "Polygon", coordinates: geom.coordinates[0] };
    case "GeometryCollection":
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
    default:
      return null;
  }
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

/** Return the areal (2D) intersection between a geometry and a spatial filter.
 * null if the intersection has no area.
 */
function intersectionAreaWithSpatialFilter(geom: Geometry, spatialFilter: SpatialFilter, resolvedGeometryRef?: Geometry) : Polygon | MultiPolygon | null {
  const geo = geometryToPolygons(geom);
  if (!geo) {
    return null;
  }
  switch (spatialFilter.operator) {
    case "intersects_point": {
      return null; // The intersection is a point, so its interior is null;
    }
    // Note: `dwithin_point` matches a feature as soon as any part of it
    // lies within `distance_m`, so the intersection is needed even for it.
    case "dwithin_point":
    case "intersects_feature":
    case "travel_time": {
      const spatialFilterGeometry = spatialFilterToGeometry(spatialFilter, resolvedGeometryRef)
      const filterPolygons = geometryToPolygons(spatialFilterGeometry);
      const inter = filterPolygons ? intersect(featureCollection([feature(filterPolygons), feature(geo)])) : null;
      return inter == null ? null : inter.geometry;
    }
    case "bbox": {
      const clipped = bboxClip(geo, [spatialFilter.west, spatialFilter.south, spatialFilter.east, spatialFilter.north]);
      return dropEmptyRings(clipped.geometry);
    }
    default: // Make a compile-time error if a filter is missing from the switch
      const noFilter: never = spatialFilter;
      throw new Error(`Unhandled filter case: ${noFilter}`)
  }
}

export function deriveFromGeometry(geometry: unknown, input: FeatureCollectionPostProcessInput, resolvedGeometryRef?: Geometry) {
  const spatial_extras = input.spatial_extras;

  const ret : Record<string, unknown> = {};

  if (spatial_extras.length === 0) {
    return ret;
  }

  // Assume that geometry is a Geometry. Otherwise, all the required spatial_extra will be set to null.
  const geo = geometry as Geometry;

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
      ret.length = (geo.type == "LineString" || geo.type == "MultiLineString") ? turfLength(feature(geo), { units: "meters" }) : null;
    } catch {
      ret.length = null;
    }
  }

  if (spatial_extras.includes("area")) {
    try {
      const geoAsPolygons = geometryToPolygons(geo);
      ret.area = geoAsPolygons ? area(geo) : null;
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

  // The existence of a spatial filter has already been validated, hence the final "!".
  // In case of internal error, the associated spatial_extra will be set to null.
  const spatialFilter = getSpatialFilter(input)!;

  if (requires_distance_to_filter) {
    try {
      const filterCentroid = spatialFilterToCentroid(spatialFilter, resolvedGeometryRef);
      ret.distance_to_filter = distance(geo, filterCentroid);
    } catch {
      ret.distance_to_filter = null;
    }
  }

  if (requires_intersection_area) {
    try {
      const intersection = intersectionAreaWithSpatialFilter(geo, spatialFilter, resolvedGeometryRef);
      ret.intersection_area = intersection ? area(intersection) : 0;
    } catch {
      ret.intersection_area = null;
    }
  }

  return ret;
}
