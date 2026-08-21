import type { Geometry } from "geojson";

/**
 * Narrow guard for the minimal GeoJSON geometry shape `geometryToEwkt` requires.
 *
 * @param value Unknown feature geometry value.
 * @returns `true` when the value looks like a GeoJSON geometry object.
 */
export function isGeometryLike(value: unknown): value is Geometry {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "coordinates" in value
  );
}
