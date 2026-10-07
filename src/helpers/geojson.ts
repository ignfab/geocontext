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
    "coordinates" in value &&
    Array.isArray(value.coordinates)
  );
}

/** Strip the empty parts of a Polygon or MultiPolygon.
 *
 * A Polygon without rings (`{ coordinates: [] }`) and a MultiPolygon with empty
 * parts (`[[...], []]`) are invalid GeoJSON. Returns null when nothing areal survives.
 */
export function dropEmptyRings(geom: Geometry) : Polygon | MultiPolygon | null {
  if (geom.type == "Polygon") {
    return geom.coordinates.length == 0 ? null : geom;
  }
  if (geom.type == "MultiPolygon") {
    const coordinates = geom.coordinates.filter((polygon) => polygon.length > 0);
    return coordinates.length == 0 ? null : { type: "MultiPolygon", coordinates };
  }
  return null; // not areal
}
