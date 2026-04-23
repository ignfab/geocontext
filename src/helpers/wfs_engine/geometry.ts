/**
 * GeoJSON geometry serialization helpers for the structured WFS engine.
 *
 * This module converts GeoJSON-like geometries to EWKT so they can be reused
 * in spatial CQL predicates such as `intersects_feature`.
 */

// --- Coordinate Serialization ---

/**
 * Serializes a single coordinate pair into a WKT position.
 *
 * @param position Coordinate pair expressed as `[lon, lat]`.
 * @returns A WKT position string.
 */
function positionToWkt(position: [number, number]) {
  return `${position[0]} ${position[1]}`;
}

// --- Geometry Serialization ---

/**
 * Serializes a GeoJSON-like geometry object into EWKT for CQL spatial predicates.
 *
 * @param geometry Geometry object exposing a GeoJSON `type` and `coordinates`.
 * @returns The EWKT representation of the geometry.
 */
export function geometryToEwkt(geometry: { type: string; coordinates: unknown }) {
  switch (geometry.type) {
    case "Point":
      return `SRID=4326;POINT(${positionToWkt(geometry.coordinates as [number, number])})`;
    case "MultiPoint":
      return `SRID=4326;MULTIPOINT(${(geometry.coordinates as [number, number][])
        .map((position) => `(${positionToWkt(position)})`)
        .join(",")})`;
    case "LineString":
      return `SRID=4326;LINESTRING(${(geometry.coordinates as [number, number][]).map(positionToWkt).join(",")})`;
    case "MultiLineString":
      return `SRID=4326;MULTILINESTRING(${(geometry.coordinates as [number, number][][]).map((line) => `(${line.map(positionToWkt).join(",")})`).join(",")})`;
    case "Polygon":
      return `SRID=4326;POLYGON(${(geometry.coordinates as [number, number][][]).map((ring) => `(${ring.map(positionToWkt).join(",")})`).join(",")})`;
    case "MultiPolygon":
      return `SRID=4326;MULTIPOLYGON(${(geometry.coordinates as [number, number][][][]).map((polygon) => `(${polygon.map((ring) => `(${ring.map(positionToWkt).join(",")})`).join(",")})`).join(",")})`;
    default:
      throw new Error(`Le type de géométrie '${geometry.type}' n'est pas supporté pour \`intersects_feature\`.`);
  }
}
