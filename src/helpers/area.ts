import type { Geometry, Position } from "geojson";

const DEGREES_TO_RADIANS = Math.PI / 180;
export const EARTH_RADIUS = 6371008.7714;

/** Area of a ring on the unit sphere, exact for edges straight in the lon/lat plane (GeoJSON standard lines).
 *
 * Unlike `@turf/area`, which approximates each edge, splitting an edge leaves it
 * unchanged and zero-width spikes contribute nothing.
 */
export function sphericalRingArea(ring: Position[]) : number {
  let sum = 0;
  ring.forEach(([lon1, lat1], index) => {
    const [lon2, lat2] = ring[(index + 1) % ring.length];
    // Integral of sin(latitude) along the edge, over the longitude.
    const halfDeltaLat = (lat2 - lat1) * DEGREES_TO_RADIANS / 2;
    const sinc = halfDeltaLat == 0 ? 1 : Math.sin(halfDeltaLat) / halfDeltaLat;
    sum += (lon2 - lon1) * DEGREES_TO_RADIANS * Math.sin((lat1 + lat2) * DEGREES_TO_RADIANS / 2) * sinc;
  });
  return Math.abs(sum);
}

/** Area of a geometry.
 * 
 * Replacement of @turf/area with improved precision.
 * 
 * @param geo Input geometry
 * @returns The area of the areal parts of the geometry, in m²
 */
export default function area(geo: Geometry) : number {
  switch (geo.type) {
    case "Point":
    case "MultiPoint":
    case "LineString":
    case "MultiLineString":
      return 0;
    case "Polygon":
    case "MultiPolygon": {
      let total = 0;
      for (const poly of geo.type === "Polygon" ? [geo.coordinates] : geo.coordinates) {
        const [outer, ...holes] = poly;
        total += holes.reduce((remaining, hole) => remaining - sphericalRingArea(hole), sphericalRingArea(outer));
      }
      return total * EARTH_RADIUS**2;
    }
    case "GeometryCollection": {
      return geo.geometries.reduce((acc, geom) => acc + area(geom), 0);
    }
  }
}
