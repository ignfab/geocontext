import { centroid } from "@turf/centroid";
import { bbox } from "@turf/bbox";
import turfLength from "@turf/length";
import { intersect } from "@turf/intersect";
import { circle } from "@turf/circle";
import { bboxPolygon } from "@turf/bbox-polygon";
import type { BBox, Geometry, LineString, MultiLineString, MultiPolygon, Point, Polygon, Position } from "geojson";
import distance from "../helpers/distance.js";
import { feature, featureCollection } from "@turf/helpers";
import { getSpatialFilter } from "./spatialFilter.js";
import type {
  SpatialFilterInput,
  SpatialExtraOptions,
  SpatialFilter,
} from "./schema.js";
import { bboxClip } from "@turf/bbox-clip";
import area, { clipRingToTriangle, triangulate } from "../helpers/area.js";

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
  clipFilter: FilterClipper | null
}

export function prepareSpatialContext(input: FeatureCollectionPostProcessInput, resolvedGeometryRef?: Geometry) : SpatialContext {
  const requires_distance_to_filter_center = input.spatial_extras.includes("distance_to_filter_center");
  const requires_intersection_area = input.spatial_extras.includes("intersection_area");

  const context : SpatialContext = {
    filterCentroid: null,
    clipFilter: null,
  };

  if (!requires_distance_to_filter_center && !requires_intersection_area) {
    // short-circuit: don't compute the spatial filter
    return context;
  }

  // The input schema guarantees a spatial filter when a filter-dependent extra is
  // requested (`assertSpatialExtraSpatialFilterConsistency`), hence the final "!".
  // In case of internal error, the associated spatial_extra will be set to null.
  const spatialFilter = getSpatialFilter(input)!;

  if (requires_distance_to_filter_center) {
    try {
      context.filterCentroid = spatialFilterToCentroid(spatialFilter, resolvedGeometryRef);
    } catch {}
  }

  if (requires_intersection_area) {
    try {
      const filterPolygons = geometryToPolygons(spatialFilterToGeometry(spatialFilter, resolvedGeometryRef));
      context.clipFilter = filterPolygons && makeFilterClipper(filterPolygons);
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

/** Return the filter clipped to a tile containing the bbox, or null if nothing areal remains. */
type FilterClipper = (bbox: BBox) => Polygon | MultiPolygon | null;

/** Build a `FilterClipper` which only processes the filter vertices near the bbox.
 *
 * The filter is clipped to nested tiles, each from the cached clip of its parent.
 * Tiles are 1.5 times as wide as their cell, so that a bbox at most half a cell
 * wide lies in the tile of the cell containing its south-west corner.
 */
function makeFilterClipper(filter: Polygon | MultiPolygon) : FilterClipper {
  const [west, south, east, north] = bbox(filter);
  const size = Math.max(east - west, north - south);
  const tiles = new Map<string, Polygon | MultiPolygon | null>();
  function tile(zoom: number, x: number, y: number) : Polygon | MultiPolygon | null {
    if (zoom == 0) return filter;
    const key = `${zoom}/${x}/${y}`;
    if (!tiles.has(key)) {
      const parent = tile(zoom - 1, Math.floor(x / 2), Math.floor(y / 2));
      const cell = size / 2 ** zoom;
      tiles.set(key, parent && dropEmptyRings(bboxClip(parent, [west + x * cell, south + y * cell, west + (x + 1.5) * cell, south + (y + 1.5) * cell]).geometry));
    }
    return tiles.get(key) ?? null;
  }
  return ([minX, minY, maxX, maxY]) => {
    // Deepest tile whose cell is at least twice as wide as the bbox.
    const width = Math.max(maxX - minX, maxY - minY);
    let zoom = 0;
    while (zoom < 20 && 2 * width <= size / 2 ** (zoom + 1)) zoom++;
    const cell = size / 2 ** zoom;
    return tile(zoom, Math.floor((minX - west) / cell), Math.floor((minY - south) / cell));
  };
}

/** Polygons of a polygonal geometry, as lists of rings. */
function polygonsOf(geo: Polygon | MultiPolygon) : Position[][][] {
  return geo.type == "Polygon" ? [geo.coordinates] : geo.coordinates;
}

function positionCount(geo: Polygon | MultiPolygon) : number {
  return polygonsOf(geo).flat().reduce((count, ring) => count + ring.length, 0);
}

/** True when `geo` is the whole `box`, as clipping returns a geometry covering it. */
function isBox(geo: Polygon | MultiPolygon, [west, south, east, north]: BBox) : boolean {
  const rings = polygonsOf(geo).flat();
  if (rings.length != 1 || rings[0].length != 5) return false;
  const corners = rings[0].slice(0, -1);
  return corners.every(([x, y]) => (x == west || x == east) && (y == south || y == north))
    && new Set(corners.map(String)).size == 4;
}

/** Beyond this many positions, geometries are split before being triangulated. */
const MAX_TRIANGULATED_POSITIONS = 32;
/** Bound on the number of halvings, in case positions pile up at the same place. */
const MAX_HALVINGS = 24;

/** Return the area of the intersection between two areal geometries lying in `box`.
 *
 * Clipping by a triangle is simple, fast and robust, unlike general polygon
 * clipping: the geometry with fewer positions is split into triangles, by which
 * the other one is clipped. As this costs the product of their numbers of
 * positions, the box is first halved until one of them is small.
 */
function boxIntersectionArea(a: Polygon | MultiPolygon, b: Polygon | MultiPolygon, box: BBox, halvings = 0) : number {
  const [small, large] = positionCount(a) <= positionCount(b) ? [a, b] : [b, a];
  if (positionCount(small) > MAX_TRIANGULATED_POSITIONS && halvings < MAX_HALVINGS) {
    const [west, south, east, north] = box;
    const halves : BBox[] = east - west > north - south
      ? [[west, south, (west + east) / 2, north], [(west + east) / 2, south, east, north]]
      : [[west, south, east, (south + north) / 2], [west, (south + north) / 2, east, north]];
    return halves.reduce((total, half) => {
      const smallHalf = dropEmptyRings(bboxClip(small, half).geometry);
      const largeHalf = smallHalf && dropEmptyRings(bboxClip(large, half).geometry);
      return largeHalf ? total + boxIntersectionArea(smallHalf, largeHalf, half, halvings + 1) : total;
    }, 0);
  }

  if (isBox(small, box)) return area(large);
  const triangulations = polygonsOf(small).map(triangulate);
  if (triangulations.includes(null)) {
    // Fall back on general polygon clipping, as for self-intersecting rings.
    const inter = intersect(featureCollection<Polygon | MultiPolygon>([feature(small), feature(large)]));
    return inter == null ? 0 : area(inter.geometry);
  }
  let total = 0;
  for (const triangle of triangulations.flatMap((triangles) => triangles!)) {
    total += area({ type: "MultiPolygon", coordinates: polygonsOf(large).map((rings) => rings.map((ring) => clipRingToTriangle(ring, triangle))) });
  }
  return total;
}

/** Return the area of the intersection between two areal (2D) geometries. */
function polygonsIntersectionArea(geo: Polygon | MultiPolygon, clipFilter: FilterClipper) : number {
  let total = 0;
  for (const polygon of polygonsOf(geo)) {
    const polygonGeometry : Polygon = { type: "Polygon", coordinates: polygon };
    // Whatever lies outside the bbox of one geometry cannot intersect it, so
    // clipping the other first leaves the result unchanged while only the
    // neighbouring positions are processed afterwards.
    const polygonBbox = bbox(polygonGeometry);
    const nearFilter = clipFilter(polygonBbox);
    const clippedFilter = nearFilter && dropEmptyRings(bboxClip(nearFilter, polygonBbox).geometry);
    if (!clippedFilter) continue; // no areal overlap
    const polygonArea = area(polygonGeometry);
    if (isBox(clippedFilter, polygonBbox)) { // the filter contains the polygon
      total += polygonArea;
      continue;
    }
    const filterBbox = bbox(clippedFilter);
    // Clipping the polygon to its own bbox would only copy it.
    const clippedPolygon = filterBbox.every((value, index) => value == polygonBbox[index])
      ? polygonGeometry
      : dropEmptyRings(bboxClip(polygonGeometry, filterBbox).geometry);
    if (!clippedPolygon) continue;

    const covered = boxIntersectionArea(clippedPolygon, clippedFilter, filterBbox);
    // Snap to 0 or to the whole polygon despite rounding errors.
    total += covered > polygonArea * (1 - 1e-9) ? polygonArea : covered > polygonArea * 1e-9 ? covered : 0;
  }
  return total;
}

/** Return the area (m²) of the part of a geometry lying inside a spatial filter.
 *
 * null when it cannot be computed: the geometry or the filter has no areal part,
 * or the filter geometry could not be prepared. 0 only when both are areal and
 * do not overlap.
 */
function intersectionAreaWithSpatialFilter(geom: Geometry, spatialFilter: SpatialFilter, clipFilter: FilterClipper | null) : number | null {
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
      if (!clipFilter) return null; // non-areal filter, or filter preparation failed
      return polygonsIntersectionArea(geo, clipFilter);
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

  const requires_distance_to_filter_center = spatial_extras.includes("distance_to_filter_center");
  const requires_intersection_area = spatial_extras.includes("intersection_area");

  if (!requires_distance_to_filter_center && !requires_intersection_area) {
    // short-circuit: don't compute the spatial filter
    return ret;
  }

  // The input schema guarantees a spatial filter when a filter-dependent extra is
  // requested (`assertSpatialExtraSpatialFilterConsistency`), hence the final "!".
  // In case of internal error, the associated spatial_extra will be set to null.
  const spatialFilter = getSpatialFilter(input)!;

  if (requires_distance_to_filter_center) {
    try {
      const filterCentroid = context.filterCentroid!;
      ret.distance_to_filter_center = distance(geo, filterCentroid);
    } catch {
      ret.distance_to_filter_center = null;
    }
  }

  if (requires_intersection_area) {
    try {
      ret.intersection_area = intersectionAreaWithSpatialFilter(geo, spatialFilter, context.clipFilter);
    } catch {
      ret.intersection_area = null;
    }
  }

  return ret;
}
