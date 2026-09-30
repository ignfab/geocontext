import type { Geometry, GeometryCollection, MultiPolygon, Polygon } from "geojson";

/**
 * Narrow guard for the minimal GeoJSON geometry shape `geometryToEwkt` requires.
 *
 * @param value Unknown feature geometry value.
 * @returns `true` when the value looks like a GeoJSON geometry object.
 */
export function isGeometryLike(value: unknown): value is Exclude<Geometry, GeometryCollection> {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "coordinates" in value
  );
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
