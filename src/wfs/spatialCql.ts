/**
 * Spatial CQL compilation helpers for the structured WFS query compiler.
 *
 * This module turns normalized spatial filter objects into CQL fragments that
 * can be combined with attribute predicates in the final query.
 */

import type { CollectionProperty } from "@ignfab/gpf-schema-store";

import type { SpatialFilter } from "./schema.js";

import { geometryToEwkt } from "../wfs/geometry.js"
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import InteriorPointArea from 'jsts/org/locationtech/jts/algorithm/InteriorPointArea.js'

// --- Public Types ---

export type GeometryLike = {
  type: string;
  coordinates: unknown;
};


// --- Helper Types and Functions ---

type GeoJSONPoint = { type: "Point", coordinates: number[] }
type GeoJSONMultiPoint = { type: "MultiPoint", coordinates: number[][] }

/**
 * Return a Geometry with one inner point per disjoint sub-geometry of the input.
 *
 * @param geometry Input geometry possibly composed of multiple sub-geometries
 * @returns A Geometry of type either "Point" or "MultiPoint".
 */
function findInnerPoints(geometry: GeometryLike) : GeoJSONPoint | GeoJSONMultiPoint {
  let ret: GeoJSONMultiPoint;
  switch (geometry.type) {
    case "Point":
      return geometry as GeoJSONPoint;
    case "MultiPoint":
      ret = geometry as GeoJSONMultiPoint;
      break;
    case "LineString":
      const jtsline = (new GeoJSONReader(new GeometryFactory())).read(geometry);
      const linepoint = InteriorPointArea.getInteriorPoint(jtsline)
      return {
        type: "Point",
        coordinates: [linepoint.x, linepoint.y]
      };
    case "MultiLineString":
      const multilinecoords = geometry.coordinates as [number, number][][]
      ret = {
        type: "MultiPoint",
        coordinates: multilinecoords.map(linecoords => (findInnerPoints({
          type: "LineString",
          coordinates: linecoords,
        }) as GeoJSONPoint).coordinates)
      };
      break;
    case "Polygon":
      const jtspolygon = (new GeoJSONReader(new GeometryFactory())).read(geometry);
      const polygonpoint = InteriorPointArea.getInteriorPoint(jtspolygon)
      return {
        type: "Point",
        coordinates: [polygonpoint.x, polygonpoint.y]
      };
    case "MultiPolygon":
      const multipolygoncoords = geometry.coordinates as [number, number][][]
      ret = {
        type: "MultiPoint",
        coordinates: multipolygoncoords.map(polygoncoords => (findInnerPoints({
          type: "Polygon",
          coordinates: polygoncoords,
        }) as GeoJSONPoint).coordinates)
      };
      break;
    default:
      throw new Error(`Le type de géométrie '${geometry.type}' n'est pas supporté pour \`intersects_feature\` et \`adjacent_feature\`.`);
  }
  if (ret.coordinates.length == 1) {
    return {
      type: "Point",
      coordinates: ret.coordinates[0]
    }
  }
  return ret;
}

// --- Spatial Predicate Compilation ---

/**
 * Compiles a bbox spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized bbox filter.
 * @returns A CQL bbox predicate.
 */
export function compileBboxSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { operator: "bbox" }>) {
  if (spatialFilter.west >= spatialFilter.east) {
    throw new Error("Le bbox est invalide : `west` doit être strictement inférieur à `east`.");
  }
  if (spatialFilter.south >= spatialFilter.north) {
    throw new Error("Le bbox est invalide : `south` doit être strictement inférieur à `north`.");
  }
  return `BBOX(${geometryProperty.name},${spatialFilter.west},${spatialFilter.south},${spatialFilter.east},${spatialFilter.north},'EPSG:4326')`;
}

/**
 * Compiles an intersects-point spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized point intersection filter.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsPointSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { operator: "intersects_point" }>) {
  return `INTERSECTS(${geometryProperty.name},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}))`;
}

/**
 * Compiles a distance-based spatial filter into a CQL predicate.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized distance filter.
 * @returns A CQL dwithin predicate.
 */
export function compileDwithinSpatialFilter(geometryProperty: CollectionProperty, spatialFilter: Extract<SpatialFilter, { operator: "dwithin_point" }>) {
  return `DWITHIN(${geometryProperty.name},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}),${spatialFilter.distance_m},meters)`;
}

/**
 * Compiles an `intersects_feature` spatial filter once the reference geometry is already serialized.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param geometry The actual geometry and its EWKT serialization.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsFeatureSpatialFilter(geometryProperty: CollectionProperty, geometry: GeometryLike) {
  return `INTERSECTS(${geometryProperty.name},${geometryToEwkt(geometry)})`;
}

/**
 * Compiles an `adjacent_feature` spatial filter once the reference geometry is already serialized.
 *
 * @param geometryProperty Geometry property already resolved for the feature type.
 * @param geometry The actual geometry and its EWKT serialization.
 * @returns A CQL predicate composed of an "intersect" and a "not intersects".
 */
export function compileAdjacentFeatureSpatialFilter(geometryProperty: CollectionProperty, geometry: GeometryLike) {
  const innerPoints = geometryToEwkt(findInnerPoints(geometry));
  return `INTERSECTS(${geometryProperty.name},${geometryToEwkt(geometry)}) AND NOT INTERSECTS(${geometryProperty.name},${innerPoints})`;
}
