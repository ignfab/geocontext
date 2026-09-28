import earcut, { deviation, flatten } from "earcut";
import type { Geometry, Position } from "geojson";

type Triangle = [Position, Position, Position];

const DEGREES_TO_RADIANS = Math.PI / 180;
const EARTH_RADIUS = 6371008.7714;

/** Positive when `c` lies on the left of the line going from `a` to `b`, negative on its right. */
function cross(a: Position, b: Position, c: Position) : number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** Clip a closed ring by a triangle, using the Sutherland–Hodgman algorithm.
 *
 * The result may contain zero-width spikes along the triangle edges, which do not
 * change its area. It is empty when nothing areal survives.
 */
export function clipRingToTriangle(ring: Position[], [a, b, c]: Triangle) : Position[] {
  // Orient the triangle counterclockwise, so that its interior lies on the left of each edge.
  const edges = cross(a, b, c) > 0 ? [[a, b], [b, c], [c, a]] : [[a, c], [c, b], [b, a]];
  let clipped = ring.slice(0, -1); // Drop the closing position
  for (const [start, end] of edges) {
    const input = clipped;
    clipped = [];
    input.forEach((current, index) => {
      const previous = input.at(index - 1)!; // The last position for the first one
      const previousSide = cross(start, end, previous);
      const currentSide = cross(start, end, current);
      if ((previousSide >= 0) !== (currentSide >= 0)) {
        // The edge crosses the line: keep the crossing point. Both sides have
        // different signs, so the denominator cannot be 0.
        const t = previousSide / (previousSide - currentSide);
        clipped.push([previous[0] + t * (current[0] - previous[0]), previous[1] + t * (current[1] - previous[1])]);
      }
      if (currentSide >= 0) {
        clipped.push(current);
      }
    });
  }
  return clipped.length < 3 ? [] : [...clipped, clipped[0]];
}

/** Split a polygon into triangles, or return null if it cannot be done reliably,
 * as for self-intersecting rings.
 */
export function triangulate(polygon: Position[][]) : Triangle[] | null {
  const { vertices, holes, dimensions } = flatten(polygon);
  const indices = earcut(vertices, holes, dimensions);
  // The triangles must cover the polygon exactly.
  if (deviation(vertices, holes, dimensions, indices) > 1e-6) {
    return null;
  }
  const position = (index: number) : Position => [vertices[index * dimensions], vertices[index * dimensions + 1]];
  const triangles : Triangle[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    triangles.push([position(indices[i]), position(indices[i + 1]), position(indices[i + 2])]);
  }
  return triangles;
}

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
