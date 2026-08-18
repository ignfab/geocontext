import { describe, expect, it } from "vitest";

import distance, { distanceVincenty, haversine } from "../../src/helpers/distance.js";
import { besancon, chamonix, marseille, paris, parisMarseille } from "../samples";
import type {
  Geometry,
  GeometryCollection,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";

function expectCloseRatio(actual: number, expected: number, ratio: number, label: string) {
  const tolerance = Math.abs(expected) * ratio;
  expect(Math.abs(actual - expected), `${label}: expected ~${expected}, got ${actual}`).toBeLessThanOrEqual(tolerance);
}

function ensureSymmetricDistance(
  a: Geometry,
  b: Geometry,
  label: string,
  metric?: "haversine" | "vincenty",
) {
  const ab = distance(a, b, metric).distance;
  const ba = distance(b, a, metric).distance;
  expect(ab, `${label}: A->B/B->A mismatch`).toBeCloseTo(ba, 6);
  return ab;
}

function expectZeroBothWays(a: Geometry, b: Geometry, label: string) {
  expect(ensureSymmetricDistance(a, b, label)).toBe(0);
}

function expectThrowBothWays(a: Geometry, b: Geometry, error: RegExp) {
  expect(() => distance(a, b)).toThrow(error);
  expect(() => distance(b, a)).toThrow(error);
}

describe("distance helper", () => {
  describe("baseline real-world checks", () => {
    it("supports a Vincenty-backed point metric", () => {
      const defaultDistance = distance(paris, marseille).distance;
      const vincentyDistance = ensureSymmetricDistance(paris, marseille, "Paris-Marseille Vincenty", "vincenty");
      const result = distance(paris, marseille, "vincenty");
      const expected = Math.round(distanceVincenty(paris.coordinates, marseille.coordinates) * 100) / 100;
      expect(result.distance).toBe(expected);
      expect(result.distance).toBe(vincentyDistance);
      expect(result.distance).not.toBe(defaultDistance);
      expect(result.point1).toEqual(paris.coordinates);
      expect(result.point2).toEqual(marseille.coordinates);
    });

    it("computes Paris->Marseille", () => {
      const result = distance(paris, marseille);
      expectCloseRatio(result.distance, 662_488.38, 0.0005, "Paris-Marseille distance");
      expect(result.point1).toEqual(paris.coordinates);
      expect(result.point2).toEqual(marseille.coordinates);
    });

    it("computes Besancon->(Paris,Marseille) with point fixed on Besancon", () => {
      const result = distance(besancon, parisMarseille);
      expectCloseRatio(result.distance, 198_521.68, 0.002, "Besancon-line distance");
      expect(result.point1).toEqual(besancon.coordinates);
    });

    it("computes Paris->Lyon", () => {
      const lyon: Geometry = { type: "Point", coordinates: [4.835, 45.764] };
      expectCloseRatio(distance(paris, lyon).distance, 392_000, 0.02, "Paris-Lyon distance");
    });

    it("computes Eiffel Tower->Notre-Dame", () => {
      const eiffelTower: Geometry = { type: "Point", coordinates: [2.2945, 48.8584] };
      const notreDame: Geometry = { type: "Point", coordinates: [2.3499, 48.853] };
      expectCloseRatio(distance(eiffelTower, notreDame).distance, 4_100, 0.05, "Eiffel-Notre-Dame distance");
    });

    it("computes point near Loire to simplified Loire path", () => {
      const loire: Geometry = {
        type: "LineString",
        coordinates: [
          [1.9, 47.9],
          [1.33, 47.59],
          [0.68, 47.39],
        ],
      };
      const nearbyPoint: Geometry = { type: "Point", coordinates: [1.9, 48.0] };
      const result = distance(nearbyPoint, loire);
      expect(result.distance).toBeGreaterThan(0);
      expectCloseRatio(result.distance, 11_100, 0.15, "point-to-Loire distance");
    });

    it("keeps Corsica-mainland Var distance in plausible range", () => {
      const corsica: Geometry = {
        type: "Polygon",
        coordinates: [[[8.5, 41.3], [9.6, 41.3], [9.6, 43.0], [8.5, 43.0], [8.5, 41.3]]],
      };
      const mainlandVar: Geometry = {
        type: "Polygon",
        coordinates: [[[6.0, 43.0], [6.9, 43.0], [6.9, 43.3], [6.0, 43.3], [6.0, 43.0]]],
      };
      const result = distance(corsica, mainlandVar);
      expect(result.distance).toBeGreaterThan(100_000);
      expect(result.distance).toBeLessThan(220_000);
    });
  });

  describe("containment and intersections", () => {
    it("returns zero for point inside polygon", () => {
      const point: Geometry = { type: "Point", coordinates: [5, 5] };
      const polygon: Geometry = {
        type: "Polygon",
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      };
      expect(distance(point, polygon).distance).toBe(0);
    });

    it("returns positive for point in polygon hole", () => {
      const point: Geometry = { type: "Point", coordinates: [5, 5] };
      const polygonWithHole: Geometry = {
        type: "Polygon",
        coordinates: [
          [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
          [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]],
        ],
      };
      expect(distance(point, polygonWithHole).distance).toBeGreaterThan(0);
    });

    it("returns zero for crossing lines with shared closest point", () => {
      const l1: Geometry = { type: "LineString", coordinates: [[0, 0], [10, 10]] };
      const l2: Geometry = { type: "LineString", coordinates: [[0, 10], [10, 0]] };
      const result = distance(l1, l2);
      expectZeroBothWays(l1, l2, "crossing lines");
      expect(result.point1).toEqual([5, 5]);
      expect(result.point2).toEqual([5, 5]);
    });

    it("returns zero for GeometryCollections that intersect", () => {
      const containingPolygon: Polygon = {
        type: "Polygon",
        coordinates: [[[2.0, 48.0], [3.0, 48.0], [3.0, 49.0], [2.0, 49.0], [2.0, 48.0]]],
      };

      const gcA: GeometryCollection = {
        type: "GeometryCollection",
        geometries: [paris, { type: "LineString", coordinates: [[0, 0], [0.5, 0.5]] }],
      };
      const gcB: GeometryCollection = { type: "GeometryCollection", geometries: [containingPolygon] };
      expectZeroBothWays(gcA, gcB, "intersecting geometry collections");
    });

    // Zero distance is settled in two steps: an indexed pass over the
    // boundaries, then a point-in-area test per component for the strict
    // containment the boundaries cannot show. These cases pin both outcomes of
    // that second step.
    it("returns zero for a polygon strictly inside another polygon", () => {
      const outer: Polygon = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
      const inner: Polygon = { type: "Polygon", coordinates: [[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
      expectZeroBothWays(inner, outer, "polygon strictly inside a polygon");
    });

    it("returns zero for a line strictly inside a polygon", () => {
      const polygon: Polygon = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
      const line: LineString = { type: "LineString", coordinates: [[4, 4], [6, 6]] };
      expectZeroBothWays(line, polygon, "line strictly inside a polygon");
    });

    it("returns zero when only one part of a MultiPolygon is inside", () => {
      const outer: Polygon = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
      const parts: MultiPolygon = {
        type: "MultiPolygon",
        coordinates: [
          [[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]],         // inside
          [[[40, 40], [41, 40], [41, 41], [40, 41], [40, 40]]], // far outside
        ],
      };
      expectZeroBothWays(parts, outer, "one MultiPolygon part inside");
    });

    it("returns positive for a polygon sitting in another polygon's hole", () => {
      const ringWithHole: Polygon = {
        type: "Polygon",
        coordinates: [
          [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
          [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
        ],
      };
      const inHole: Polygon = { type: "Polygon", coordinates: [[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
      const d = ensureSymmetricDistance(inHole, ringWithHole, "polygon in a hole");
      // Nearest is the 1 degree gap from the square's edge to the hole's wall.
      expect(d).toBeGreaterThan(0);
      expectCloseRatio(d, haversine([6, 6], [7, 6]), 0.01, "polygon in a hole");
    });

    it("returns positive for a square parked in a C-shape's notch", () => {
      // The C-shape's bounding box swallows the square's whole bounding box, so
      // the envelope shortcut cannot rule out an intersection and the
      // containment test has to answer "not contained" on its own. At
      // y in (1, 3) the C-shape's interior is only x in (0, 1).
      const cShape: Polygon = {
        type: "Polygon",
        coordinates: [[[0, 0], [10, 0], [10, 1], [1, 1], [1, 3], [10, 3], [10, 4], [0, 4], [0, 0]]],
      };
      const inNotch: Polygon = { type: "Polygon", coordinates: [[[2, 1.2], [9, 1.2], [9, 2.8], [2, 2.8], [2, 1.2]]] };
      const d = ensureSymmetricDistance(inNotch, cShape, "square in a C-shape notch");
      expect(d).toBeGreaterThan(0);
      // Nearest is the 0.2 degree gap down to the C-shape's y = 1 edge.
      expectCloseRatio(d, haversine([5, 1], [5, 1.2]), 0.01, "square in a C-shape notch");
    });

    it("does not misclassify outside point for polygon with duplicate vertex", () => {
      const polygonWithDuplicateVertex: Polygon = {
        type: "Polygon",
        coordinates: [[[0, 0], [2, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
      };
      const pointOutside: Point = { type: "Point", coordinates: [10, 10] };
      const result = distance(pointOutside, polygonWithDuplicateVertex);
      expect(ensureSymmetricDistance(pointOutside, polygonWithDuplicateVertex, "duplicate vertex polygon outside point")).toBeGreaterThan(0);
      expect(result.point1).toEqual([10, 10]);
    });
  });

  describe("antimeridian and poles", () => {
    // Antimeridian-crossing geometries are rejected by design (RFC 7946 SHOULD split them).
    //
    // The rejection is load-bearing, not merely conservative. Two steps of the
    // pipeline read raw lon/lat degrees as a plane: the zero-distance test
    // (`RelateOp.intersects`) and the equirectangular seed. A ring with a
    // |Δlon| > 180° edge is a different shape in that plane — it wraps the long
    // way round the globe — so both steps answer about the wrong geometry:
    //   - containment goes undetected, because the planar interior is the
    //     complement of the intended one (a point inside a 170°..190° polygon
    //     is reported ~220 km away from it instead of at distance 0),
    //   - worse, the planar phantom of a crossing LineString sweeps the
    //     hemisphere it never visits, so `intersects` fires against unrelated
    //     geometry: a 165°..-174.5° line is reported as intersecting a box at
    //     lon 23°..28°, i.e. distance 0 instead of ~13 000 km.
    // Only the azimuthal refinement is antimeridian-safe, since it projects each
    // vertex spherically; it cannot rescue either step above.
    const polarRing = (lat: number, sign = 1) => {
      const ring = Array.from({ length: 36 }, (_, i) => [sign * (-180 + (i * 360) / 36), lat] as [number, number]);
      ring.push(ring[0]);
      return ring;
    };

    it.each([
      {
        name: "throws for a polygon that crosses the antimeridian",
        g1: { type: "Point", coordinates: [172, 5] } as Geometry,
        g2: {
          type: "Polygon",
          coordinates: [
            [[170, 0], [170, 10], [-170, 10], [-170, 0], [170, 0]],
            [[175, 3], [175, 7], [178, 7], [178, 3], [175, 3]],
          ],
        } as Geometry,
      },
      {
        name: "throws for a polar-cap polygon whose closing edge spans > 180° of longitude",
        g1: { type: "Point", coordinates: [0, 85] } as Geometry,
        g2: { type: "Polygon", coordinates: [polarRing(80)] } as Geometry,
      },
      {
        name: "throws for a south polar cap",
        g1: { type: "Point", coordinates: [0, -85] } as Geometry,
        g2: { type: "Polygon", coordinates: [polarRing(-80)] } as Geometry,
      },
      {
        // Both rings encircle a pole, so both carry a > 180° closing edge. The
        // guard has to walk holes, not just shells.
        name: "throws for a polar annulus whose shell and hole both encircle the pole",
        g1: { type: "Point", coordinates: [0, 80] } as Geometry,
        g2: { type: "Polygon", coordinates: [polarRing(70), polarRing(85, -1)] } as Geometry,
      },
      {
        // Shell stays east of the antimeridian; only the hole crosses it.
        name: "throws for a polygon whose hole alone crosses the antimeridian",
        g1: { type: "Point", coordinates: [0, 0] } as Geometry,
        g2: {
          type: "Polygon",
          coordinates: [
            [[160, -10], [160, 20], [170, 20], [170, -10], [160, -10]],
            [[175, 0], [175, 10], [-175, 10], [-175, 0], [175, 0]],
          ],
        } as Geometry,
      },
      {
        name: "throws when only one MultiPolygon part crosses the antimeridian",
        g1: { type: "Point", coordinates: [50, 50] } as Geometry,
        g2: {
          type: "MultiPolygon",
          coordinates: [
            [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            [[[170, 0], [170, 10], [-170, 10], [-170, 0], [170, 0]]],
          ],
        } as Geometry,
      },
      {
        name: "throws when only one MultiLineString member crosses the antimeridian",
        g1: { type: "Point", coordinates: [50, 50] } as Geometry,
        g2: { type: "MultiLineString", coordinates: [[[0, 0], [1, 1]], [[170, 5], [-170, 5]]] } as Geometry,
      },
      {
        name: "throws when a GeometryCollection member crosses the antimeridian",
        g1: { type: "Point", coordinates: [50, 50] } as Geometry,
        g2: {
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [0, 0] },
            { type: "LineString", coordinates: [[170, 5], [-170, 5]] },
          ],
        } as Geometry,
      },
    ])("$name", ({ g1, g2 }) => expectThrowBothWays(g1, g2, /RFC 7946/));

    // The guard triggers on |Δlon| > 180°, so a half-globe edge is still legal
    // and must not be swept up with the crossing ones.
    it("accepts an edge spanning exactly 180° of longitude", () => {
      const line: Geometry = { type: "LineString", coordinates: [[-90, 10], [90, 10]] };
      const point: Geometry = { type: "Point", coordinates: [0, 0] };
      // Edges interpolate linearly in lon/lat, so the line passes through [0,10].
      expectCloseRatio(
        ensureSymmetricDistance(point, line, "exactly 180 degrees of longitude"),
        haversine([0, 0], [0, 10]),
        0.001,
        "exactly 180 degrees of longitude",
      );
    });

    // The following case used to expect an error, but the new implementation
    // supports antimeridian-adjacent geometries. Test it as a normal symmetric
    // distance case instead.
    it("accepts a pair of individually valid geometries facing each other across the antimeridian", () => {
      const g1: Geometry = {
        type: "Polygon",
        coordinates: [[[179.8, -0.1], [179.9, -0.1], [179.9, 0.1], [179.8, 0.1], [179.8, -0.1]]],
      } as Geometry;
      const g2: Geometry = {
        type: "Polygon",
        coordinates: [[[-179.9, -0.1], [-179.8, -0.1], [-179.8, 0.1], [-179.9, 0.1], [-179.9, -0.1]]],
      } as Geometry;
      const d = ensureSymmetricDistance(g1, g2, "antimeridian-adjacent polygons");
      // Expected distance ~ haversine between 179.9 and -179.9 at equator (~22.3 km).
      const expected = Math.round(haversine([179.9, 0], [-179.9, 0]) * 100) / 100;
      // Check to the nearest decade of kilometers (±10 km) and sanity bounds.
      expect(Math.abs(d - expected), "antimeridian distance close to expected").toBeLessThanOrEqual(100);
      expect(Math.abs(22_300 - expected), "antimeridian distance close to expected").toBeLessThanOrEqual(100);
    });
  });

  describe("antimeridian-safe Multi* geometries (RFC 7946 conforming)", () => {
    it.each([
      {
        name: "accepts a MultiPolygon with one sub-polygon on each side of the antimeridian",
        g1: { type: "Point", coordinates: [179, 2.5] } as Geometry,
        g2: {
          type: "MultiPolygon",
          coordinates: [
            [[[178, 0], [180, 0], [180, 5], [178, 5], [178, 0]]],
            [[[-180, 0], [-178, 0], [-178, 5], [-180, 5], [-180, 0]]],
          ],
        } as Geometry,
      },
      {
        name: "accepts a MultiLineString representing a line cut at the antimeridian",
        g1: { type: "Point", coordinates: [179, 2] } as Geometry,
        g2: {
          type: "MultiLineString",
          coordinates: [
            [[178, 2], [180, 2]],
            [[-180, 2], [-175, 2]],
          ],
        } as Geometry,
      },
    ])("$name", ({ g1, g2 }) => {
      expectZeroBothWays(g1, g2, "antimeridian-safe multi geometry");
    });
  });

  describe("composite geometries", () => {
    it("is symmetric for MultiLineString vs MultiPolygon", () => {
      const multiLine: MultiLineString = {
        type: "MultiLineString",
        coordinates: [parisMarseille.coordinates, [[7.5, 46.0], [7.8, 46.3]]],
      };
      const multiPolygon: MultiPolygon = {
        type: "MultiPolygon",
        coordinates: [
          [[[1.8, 48.2], [2.8, 48.2], [2.8, 49.1], [1.8, 49.1], [1.8, 48.2]]],
          [[[6.6, 45.6], [7.1, 45.6], [7.1, 46.0], [6.6, 46.0], [6.6, 45.6]]],
        ],
      };

      ensureSymmetricDistance(multiLine, multiPolygon, "MultiLineString/MultiPolygon");
    });

    it("handles MultiPoint fallback", () => {
      const a: MultiPoint = {
        type: "MultiPoint",
        coordinates: [paris.coordinates, marseille.coordinates],
      };
      const b: MultiPoint = {
        type: "MultiPoint",
        coordinates: [chamonix.coordinates, paris.coordinates],
      };
      expectZeroBothWays(a, b, "MultiPoint fallback");
    });

    it("uses nearest piece for MultiPolygon", () => {
      const multiPolygon: Geometry = {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
        ],
      };
      const p: Geometry = { type: "Point", coordinates: [5.5, 5.5] };
      expectZeroBothWays(p, multiPolygon, "nearest piece for MultiPolygon");
    });

    it("uses nearest member for GeometryCollection", () => {
      const collection: Geometry = {
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [0, 0] },
          { type: "LineString", coordinates: [[20, 20], [21, 21]] },
        ],
      };
      const p: Geometry = { type: "Point", coordinates: [0.01, 0] };
      expectCloseRatio(ensureSymmetricDistance(p, collection, "nearest collection member"), 1_112, 0.02, "nearest collection member");
    });

    it("visits isolated Point in GeometryCollection when A has no edges", () => {
      const a: Geometry = { type: "Point", coordinates: [0, 80] };
      const b: Geometry = {
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [3, 80] }, // ~57.9 km away
          { type: "LineString", coordinates: [[-5, 82], [5, 82]] }, // ~222 km away
        ],
      };
      const result = distance(a, b);
      expectCloseRatio(ensureSymmetricDistance(a, b, "isolated Point in GC"), 57_919.97, 0.01, "isolated Point in GC");
      expectCloseRatio(result.distance, 57_919.97, 0.01, "isolated Point in GC");
      expect(result.point2).toEqual([3, 80]);
    });
  });

  describe("zero-distance edge cases", () => {
    const cases: Array<{ name: string; g1: Geometry; g2: Geometry }> = [
      {
        name: "point on polygon vertex",
        g1: { type: "Point", coordinates: [0, 0] },
        g2: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] },
      },
      {
        name: "point on polygon edge",
        g1: { type: "Point", coordinates: [0.5, 0] },
        g2: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      },
      {
        name: "two lines sharing an endpoint",
        g1: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
        g2: { type: "LineString", coordinates: [[1, 1], [2, 0]] },
      },
      {
        name: "two polygons sharing an edge",
        g1: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        g2: { type: "Polygon", coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]] },
      },
      {
        name: "two polygons touching at one vertex",
        g1: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] },
        g2: { type: "Polygon", coordinates: [[[1, 0], [2, 0], [1, 1], [1, 0]]] },
      },
      {
        name: "multipolygon touching multilinestring",
        g1: {
          type: "MultiPolygon",
          coordinates: [
            [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]],
          ],
        },
        g2: {
          type: "MultiLineString",
          coordinates: [
            [[20, 20], [21, 21]],
            [[10.5, 9], [10.5, 12]],
          ],
        },
      },
      {
        name: "geometry collection member touching external point",
        g1: { type: "Point", coordinates: [1, 0] },
        g2: {
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [50, 50] },
            { type: "Polygon", coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]] },
          ],
        },
      },
      {
        name: "point on multipolygon far-piece vertex",
        g1: { type: "Point", coordinates: [101, 101] },
        g2: {
          type: "MultiPolygon",
          coordinates: [
            [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            [[[100, 100], [101, 100], [101, 101], [100, 101], [100, 100]]],
          ],
        },
      },
    ];

    it.each(cases)("returns zero for $name", ({ g1, g2, name }) => expectZeroBothWays(g1, g2, name));
  });

  describe("line/segment regression scenarios", () => {
    it("returns zero when line crosses polygon edge", () => {
      const polygon: Polygon = {
        type: "Polygon",
        coordinates: [[[1, 1], [5, 1], [5, 5], [1, 5], [1, 1]]],
      };
      const crossingLine: LineString = {
        type: "LineString",
        coordinates: [[0, 3], [6, 3]],
      };
      const result = distance(crossingLine, polygon);
      expectZeroBothWays(crossingLine, polygon, "line crosses polygon edge");
      expect(result.point1).toEqual(result.point2);
      expect(result.point2[1]).toBeCloseTo(3, 2);
    });

    it("handles parallel non-intersecting lines", () => {
      const line1: LineString = { type: "LineString", coordinates: [[1, 1], [11, 1]] };
      const line2: LineString = { type: "LineString", coordinates: [[1, 6], [11, 6]] };
      const result = distance(line1, line2);
      expect(ensureSymmetricDistance(line1, line2, "parallel non-intersecting lines")).toBeGreaterThan(0);
      expect(result.point1[0]).toBeGreaterThanOrEqual(1);
      expect(result.point1[0]).toBeLessThanOrEqual(11);
      expect(result.point2[0]).toBeGreaterThanOrEqual(1);
      expect(result.point2[0]).toBeLessThanOrEqual(11);
    });

    it("handles multiple line segments with intersection in middle", () => {
      const line1: LineString = { type: "LineString", coordinates: [[0, 0], [5, 5], [10, 10]] };
      const line2: LineString = { type: "LineString", coordinates: [[0, 10], [5, 5], [10, 0]] };
      const result = distance(line1, line2);
      expectZeroBothWays(line1, line2, "multiple line segments with intersection in middle");
      expect(result.point1).toEqual(result.point2);
    });

    it("returns concrete non-dummy intersection coordinates", () => {
      const geom1: LineString = { type: "LineString", coordinates: [[2.0, 48.0], [3.0, 49.0]] };
      const geom2: Polygon = {
        type: "Polygon",
        coordinates: [[[2.5, 48.0], [3.5, 48.0], [3.5, 49.0], [2.5, 49.0], [2.5, 48.0]]],
      };
      const result = distance(geom1, geom2);
      expectZeroBothWays(geom1, geom2, "concrete non-dummy intersection coordinates");
      expect(result.point1).toEqual(result.point2);
      expect(result.point1).not.toEqual([0, 0]);
    });

    it("handles colinear overlapping lines", () => {
      const line1: LineString = { type: "LineString", coordinates: [[0, 0], [10, 0]] };
      const line2: LineString = { type: "LineString", coordinates: [[5, 0], [15, 0]] };
      const result = distance(line1, line2);
      expectZeroBothWays(line1, line2, "colinear overlapping lines");
      expect(result.point1[0]).toBeCloseTo(result.point2[0], 10);
      expect(result.point1[1]).toBeCloseTo(result.point2[1], 10);
      expect(result.point1[1]).toBeCloseTo(0, 10);
      expect(result.point1[0]).toBeGreaterThanOrEqual(5);
      expect(result.point1[0]).toBeLessThanOrEqual(10);
    });

    it("handles colinear non-overlapping lines", () => {
      const line1: LineString = { type: "LineString", coordinates: [[0, 0], [5, 0]] };
      const line2: LineString = { type: "LineString", coordinates: [[10, 0], [15, 0]] };
      const result = distance(line1, line2);
      expect(ensureSymmetricDistance(line1, line2, "colinear non-overlapping lines")).toBeGreaterThan(0);
      expect(result.point1[1]).toBe(0);
      expect(result.point2[1]).toBe(0);
      const point1XInRange = (result.point1[0] >= 0 && result.point1[0] <= 5) || (result.point1[0] >= 10 && result.point1[0] <= 15);
      const point2XInRange = (result.point2[0] >= 0 && result.point2[0] <= 5) || (result.point2[0] >= 10 && result.point2[0] <= 15);
      expect(point1XInRange && point2XInRange).toBe(true);
    });

    it("handles line identical to polygon edge", () => {
      const polygon: Polygon = {
        type: "Polygon",
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      };
      const line: LineString = { type: "LineString", coordinates: [[0, 0], [10, 0]] };
      const result = distance(line, polygon);
      expectZeroBothWays(line, polygon, "line identical to polygon edge");
      expect(result.point1).toEqual(result.point2);
    });

    it.each([
      {
        name: "throws for a LineString that crosses the antimeridian",
        g1: {
          type: "Polygon",
          coordinates: [[
            [23.135776547816135, -5.4896438887560635],
            [27.977340911114993, -5.4896438887560635],
            [27.977340911114993, 31.956263865426763],
            [23.135776547816135, 31.956263865426763],
            [23.135776547816135, -5.4896438887560635],
          ]],
        } as Geometry,
        g2: {
          type: "LineString",
          coordinates: [
            [165.2812012336696, 6.549152703997294],
            [-174.51797643760415, 6.852029146295976],
          ],
        } as Geometry,
      },
      {
        name: "throws for a LineString that crosses the antimeridian (former artifact regression)",
        g1: {
          type: "LineString",
          coordinates: [
            [148.36866917715702, 46.84158577670763],
            [92.27258167379557, 58.34804763832423],
          ],
        } as Geometry,
        g2: {
          type: "LineString",
          coordinates: [
            [-157.2713800668627, -4.447939722741566],
            [169.80694578648507, -14.439383953401865],
          ],
        } as Geometry,
      },
    ])("$name", ({ g1, g2 }) => expectThrowBothWays(g1, g2, /RFC 7946/));

    // Two long sub-antarctic lines. Read as a plane of raw degrees they look
    // ~2 440 km apart; the true nearest pair is ~986 km, on the far end of the
    // first line. Pins that the search is not fooled by degree-space geometry.
    it("picks the true nearest pair on two long sub-antarctic lines", () => {
      const s1: Geometry = {
        type: "LineString",
        coordinates: [
          [-136.61127697878203, -67.24854737502018],
          [3.6575704307094554, -65.92384272707795],
        ],
      };
      const s2: Geometry = {
        type: "LineString",
        coordinates: [
          [-69.05775139070103, -54.8979093430909],
          [-86.16447630165361, -57.89895966720661],
        ],
      };

      const result = distance(s1, s2);
      const d = ensureSymmetricDistance(s1, s2, "long sub-antarctic lines");
      expectCloseRatio(d, 986_440, 0.005, "long sub-antarctic lines");
      expect(d).toBeLessThan(2_440_829.44);
      expectCloseRatio(result.point1[0], -85.7, 0.02, "long sub-antarctic lines point1 lon");
      expectCloseRatio(result.point1[1], -66.77, 0.02, "long sub-antarctic lines point1 lat");
      expectCloseRatio(result.point2[0], -86.16447630165361, 0.001, "long sub-antarctic lines point2 lon");
      expectCloseRatio(result.point2[1], -57.89895966720661, 0.001, "long sub-antarctic lines point2 lat");
    });

    // Both edges span tens of degrees, so the linear lon/lat path they stand
    // for and the geodesic the azimuthal plane refines along separate enough
    // that the refinement's candidate pair drifts hundreds of km off the real
    // edges (see the loop in `distance` for why that guard exists at all).
    // Caught here as a thrown error rather than a silently wrong distance.
    it("throws instead of returning a wrong distance for two very long, far-apart lines", () => {
      const a: Geometry = {
        type: "LineString",
        coordinates: [
          [73.95631313323975, 38.032363414764404],
          [41.048042762817566, -35.91032814939557],
        ],
      };
      const b: Geometry = {
        type: "LineString",
        coordinates: [
          [-33.47427845001221, 15.573780059814453],
          [-38.53770555856234, -89],
        ],
      };
      expectThrowBothWays(a, b, /Convergence error/);
    });

    it("regresses the concrete RBush false-pruning case with a poleward nearest edge", () => {
      const point: Geometry = { type: "Point", coordinates: [-10, 72] };
      const ring = Array.from({ length: 66 }, (_, i) => {
        const angle = (2 * Math.PI * i) / 65;
        return [
          -2.5 + Math.cos(angle),
          Math.max(-89, Math.min(89, 72.5 + 4 * Math.sin(angle))),
        ] as [number, number];
      });
      const shape: Geometry = {
        type: "MultiLineString",
        coordinates: Array.from({ length: 65 }, (_, i) => [ring[i], ring[i + 1]]),
      };

      const result = distance(point, shape);

      expect(result.distance).toBe(223_111.88);
      expect(result.point1).toEqual(point.coordinates);
      expect(result.point2[0]).toBeLessThan(-3.49);
      expect(result.point2[0]).toBeGreaterThan(-3.5);
      expect(result.point2[1]).toBeGreaterThan(72.12);
      expect(result.point2[1]).toBeLessThan(72.13);
    });

    // The previous test pins one witnessed failure. This one is broader: it fuzzes
    // many high-latitude >64-edge shapes and checks the general invariant that the
    // RBush-pruned result must not exceed the brute-force vertex minimum. It guards
    // against nearby variants of the same under-sized search-box bug.
    it("fuzzes the high-latitude RBush invariant for many >64-edge shapes", () => {
      let lcg = 424242;
      const rnd = () => (lcg = (lcg * 1103515245 + 12345) % 2147483648) / 2147483648;
      const ring = (cLon: number, cLat: number, r: number, n: number, seed: number): Polygon => ({
        type: "Polygon",
        coordinates: [Array.from({ length: n + 1 }, (_, i) => {
          const a = (2 * Math.PI * i) / n;
          const w = 1 + 0.3 * Math.sin(a * 5 + seed);
          return [cLon + r * w * Math.cos(a), Math.max(-89, Math.min(89, cLat + r * w * Math.sin(a)))];
        })],
      });

      for (let k = 0; k < 40; k++) {
        const latA = 40 + rnd() * 48, latB = 40 + rnd() * 48;
        const lonA = -170 + rnd() * 40, lonB = 100 + rnd() * 70;
        const a = ring(lonA, latA, 1 + rnd() * 8, 80, rnd() * 6);
        const b = ring(lonB, latB, 1 + rnd() * 8, 80, rnd() * 6);

        let got: number;
        try { got = distance(a, b).distance; } catch { continue; }

        let bruteForce = Infinity;
        for (const va of a.coordinates[0]) for (const vb of b.coordinates[0]) bruteForce = Math.min(bruteForce, haversine(va, vb));

        expect(got, `iteration ${k}: got=${got}, brute-force vertex minimum=${bruteForce}`).toBeLessThanOrEqual(bruteForce * 1.000001);
      }
    });
  });

  // Candidate edges have to be ranked in the same metric the answer is
  // reported in. The planar searches inside the helper run in a projection, and
  // if that projection carries a sphere's local scale while the caller asked
  // for Vincenty, an edge that is genuinely nearer on WGS84 loses to one that
  // is only nearer on a sphere. The pairs below sit inside the narrow window
  // where the two metrics disagree, so each one fails if the projection and the
  // metric ever drift apart again.
  describe("ranks candidate edges in the requested metric", () => {
    // A meridian edge dLon away, and a parallel edge 1 degree north. Ranking
    // them one way or the other is exactly the sphere/WGS84 disagreement:
    // - a sphere prefers the meridian edge while dLon < 1 / cos(lat),
    // - WGS84 prefers the parallel edge once dLon > M / (N cos(lat)),
    // and M / N < 1 always, so every dLon in between is ranked differently by
    // the two metrics. Each dLon here is the midpoint of that window.
    const cases = [
      { lat: 0, dLon: 0.996653 },  // window (0.993306, 1.000000)
      { lat: 45, dLon: 1.411839 }, // window (1.409464, 1.414214)
      { lat: 60, dLon: 1.998318 }, // window (1.996636, 2.000000)
    ];

    it.each(cases)("prefers the parallel edge under Vincenty at lat $lat", ({ lat, dLon }) => {
      const p: Geometry = { type: "Point", coordinates: [0, lat] };
      const edges: Geometry = {
        type: "MultiLineString",
        coordinates: [
          [[dLon, lat - 1], [dLon, lat + 1]],   // meridian edge: nearer on a sphere
          [[-dLon, lat + 1], [dLon, lat + 1]],  // parallel edge: nearer on WGS84
        ],
      };
      const parallelEdge = distanceVincenty([0, lat], [0, lat + 1]);
      const meridianEdge = distanceVincenty([0, lat], [dLon, lat]);
      expect(parallelEdge, `lat ${lat}: the case only bites if WGS84 prefers the parallel edge`).toBeLessThan(meridianEdge);

      const d = ensureSymmetricDistance(p, edges, `Vincenty edge ranking at lat ${lat}`, "vincenty");
      expect(d, `lat ${lat}: expected the parallel edge at ~${parallelEdge.toFixed(2)}, got ${d}`).toBeCloseTo(parallelEdge, 1);
    });

    it.each(cases)("prefers the meridian edge under haversine at lat $lat", ({ lat, dLon }) => {
      const p: Geometry = { type: "Point", coordinates: [0, lat] };
      const edges: Geometry = {
        type: "MultiLineString",
        coordinates: [
          [[dLon, lat - 1], [dLon, lat + 1]],
          [[-dLon, lat + 1], [dLon, lat + 1]],
        ],
      };
      const parallelEdge = haversine([0, lat], [0, lat + 1]);
      const meridianEdge = haversine([0, lat], [dLon, lat]);
      expect(meridianEdge, `lat ${lat}: on a sphere the meridian edge must be the nearer one`).toBeLessThan(parallelEdge);

      // The mirror of the test above: the fix has to follow the requested
      // metric, not hardcode the ellipsoid. A geodesic ranking here would
      // return the parallel edge instead.
      const d = ensureSymmetricDistance(p, edges, `haversine edge ranking at lat ${lat}`, "haversine");
      expect(d, `lat ${lat}: expected the meridian edge at ~${meridianEdge.toFixed(2)}, got ${d}`).toBeLessThan(parallelEdge);
      expectCloseRatio(d, meridianEdge, 0.001, `haversine edge ranking at lat ${lat}`);
    });
  });

  describe("performance sanity", () => {
    it("resolves two disjoint 500-vertex polygons in under 10 millisecond", () => {
      const circle = (centerLon: number, centerLat: number, radiusDeg: number, n: number): Geometry => ({
        type: "Polygon",
        coordinates: [
          Array.from({ length: n + 1 }, (_, i) => {
            const a = (2 * Math.PI * i) / n;
            return [centerLon + radiusDeg * Math.cos(a), centerLat + radiusDeg * Math.sin(a)];
          }),
        ],
      });

      const a = circle(2.35, 48.85, 0.3, 500);
      const b = circle(2.35, 53.85, 0.3, 500);

      const start = performance.now();
      const result = distance(a, b);
      const elapsedMs = performance.now() - start;

      expect(result.distance).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(10);
    });

    it("resolves two nearby irregular ~10000-vertex polygons in under a second", () => {
      const blob = (centerLon: number, centerLat: number, radiusDeg: number, n: number, seed: number): Geometry => ({
        type: "Polygon",
        coordinates: [
          Array.from({ length: n + 1 }, (_, i) => {
            const a = (2 * Math.PI * i) / n;
            const wobble = 1 + 0.15 * Math.sin(a * 7 + seed) + 0.08 * Math.sin(a * 13 + seed * 2);
            return [centerLon + radiusDeg * wobble * Math.cos(a), centerLat + radiusDeg * wobble * Math.sin(a)];
          }),
        ],
      });

      const a = blob(2.0, 48.0, 0.5, 10000, 1);
      const b = blob(4.0, 48.3, 0.5, 10000, 2);

      const start = performance.now();
      const result = distance(a, b);
      const elapsedMs = performance.now() - start;

      expect(result.distance).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(1_000);
    });
  });
});
