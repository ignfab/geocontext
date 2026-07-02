/**
 * Spatial CQL compilation helpers for the structured WFS query compiler.
 *
 * This module turns normalized spatial filter objects into CQL fragments that
 * can be combined with attribute predicates in the final query.
 */

import type { SpatialFilter } from "./schema.js";
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import InteriorPointArea from 'jsts/org/locationtech/jts/algorithm/InteriorPointArea.js'
import { Geometry, LineString, MultiPoint, Point, Polygon } from "geojson";
import { geometryToEwkt } from "./geometry.js";


/**
 * Return a Geometry with one inner point per disjoint sub-geometry of the input.
 *
 * @param geometry Input geometry possibly composed of multiple sub-geometries
 * @returns A Geometry of type either "Point" or "MultiPoint".
 */
function findInnerPoints(geometry: LineString | Polygon): Point;
function findInnerPoints(geometry: Geometry): Point | MultiPoint;
function findInnerPoints(geometry: Geometry) : Point | MultiPoint {
  let ret: MultiPoint;
  switch (geometry.type) {
    case "Point":
      return geometry;
    case "MultiPoint":
      ret = geometry;
      break;
    case "LineString": {
      const jts = (new GeoJSONReader(new GeometryFactory())).read(geometry);
      const point = InteriorPointArea.getInteriorPoint(jts)
      return {
        type: "Point",
        coordinates: [point.x, point.y]
      };
    }
    case "MultiLineString": {
      const coords = geometry.coordinates as [number, number][][]
      ret = {
        type: "MultiPoint",
        coordinates: coords.map(linecoords => (findInnerPoints({
          type: "LineString",
          coordinates: linecoords,
        })).coordinates)
      };
      break;
    }
    case "Polygon": {
      const jts = (new GeoJSONReader(new GeometryFactory())).read(geometry);
      const point = InteriorPointArea.getInteriorPoint(jts)
      return {
        type: "Point",
        coordinates: [point.x, point.y]
      };
    }
    case "MultiPolygon": {
      const coords = geometry.coordinates as [number, number][][][]
      ret = {
        type: "MultiPoint",
        coordinates: coords.map(polygoncoords => (findInnerPoints({
          type: "Polygon",
          coordinates: polygoncoords,
        })).coordinates)
      };
      break;
    }
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
 * @param geometryName Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized bbox filter.
 * @returns A CQL bbox predicate.
 */
export function compileBboxSpatialFilter(geometryName: string, spatialFilter: Extract<SpatialFilter, { operator: "bbox" }>) {
  if (spatialFilter.west >= spatialFilter.east) {
    throw new Error("Le bbox est invalide : `west` doit être strictement inférieur à `east`.");
  }
  if (spatialFilter.south >= spatialFilter.north) {
    throw new Error("Le bbox est invalide : `south` doit être strictement inférieur à `north`.");
  }
  return `BBOX(${geometryName},${spatialFilter.west},${spatialFilter.south},${spatialFilter.east},${spatialFilter.north},'EPSG:4326')`;
}

/**
 * Compiles an intersects-point spatial filter into a CQL predicate.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized point intersection filter.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsPointSpatialFilter(geometryName: string, spatialFilter: Extract<SpatialFilter, { operator: "intersects_point" }>) {
  return `INTERSECTS(${geometryName},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}))`;
}

/**
 * Compiles a distance-based spatial filter into a CQL predicate.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param spatialFilter Normalized distance filter.
 * @returns A CQL dwithin predicate.
 */
export function compileDwithinSpatialFilter(geometryName: string, spatialFilter: Extract<SpatialFilter, { operator: "dwithin_point" }>) {
  return `DWITHIN(${geometryName},SRID=4326;POINT(${spatialFilter.lon} ${spatialFilter.lat}),${spatialFilter.distance_m},meters)`;
}

/**
 * Compiles an `intersects_feature` spatial filter once the reference geometry is already serialized.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param geometry Reference geometry.
 * @returns A CQL intersects predicate.
 */
export function compileIntersectsFeatureSpatialFilter(geometryName: string, geometry: Geometry) {
  return `INTERSECTS(${geometryName},${geometryToEwkt(geometry)})`;
}

/**
 * Compiles an `adjacent_feature` spatial filter once the reference geometry is already serialized.
 *
 * @param geometryName Geometry property already resolved for the feature type.
 * @param geometry The actual geometry and its EWKT serialization.
 * @returns A CQL predicate composed of an "intersect" and a "not intersects".
 */
export function compileAdjacentFeatureSpatialFilter(geometryName: string, geometry: Geometry) {
  const innerPoints = geometryToEwkt(findInnerPoints(geometry));
  return `INTERSECTS(${geometryName},${geometryToEwkt(geometry)}) AND NOT INTERSECTS(${geometryName},${innerPoints})`;
}
