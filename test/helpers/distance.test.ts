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
    const capVertexCount = 36;
    const ring = Array.from({ length: capVertexCount }, (_, i) =>
      [-180 + (i * 360) / capVertexCount, 80] as [number, number],
    );
    ring.push(ring[0]);

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
        error: /RFC 7946/,
      },
      {
        name: "throws for a polar-cap polygon whose closing edge spans > 180° of longitude",
        g1: { type: "Point", coordinates: [0, 85] } as Geometry,
        g2: { type: "Polygon", coordinates: [ring] } as Geometry,
        error: /RFC 7946/,
      },
      {
        name: "throws for a pair of individually valid geometries facing each other across the antimeridian",
        g1: {
          type: "Polygon",
          coordinates: [[[179.8, -0.1], [179.9, -0.1], [179.9, 0.1], [179.8, 0.1], [179.8, -0.1]]],
        } as Geometry,
        g2: {
          type: "Polygon",
          coordinates: [[[-179.9, -0.1], [-179.8, -0.1], [-179.8, 0.1], [-179.9, 0.1], [-179.9, -0.1]]],
        } as Geometry,
        error: /Antimeridian-adjacent/,
      },
    ])("$name", ({ g1, g2, error }) => expectThrowBothWays(g1, g2, error));
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

    it("does not follow a naive s1/s2 result", () => {
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
      const d = ensureSymmetricDistance(s1, s2, "s1/s2 distance");
      expectCloseRatio(d, 986_440, 0.005, "s1/s2 distance");
      expect(d).toBeLessThan(2_440_829.44);
      expectCloseRatio(result.point1[0], -85.7, 0.02, "s1/s2 point1 lon");
      expectCloseRatio(result.point1[1], -66.77, 0.02, "s1/s2 point1 lat");
      expectCloseRatio(result.point2[0], -86.16447630165361, 0.001, "s1/s2 point2 lon");
      expectCloseRatio(result.point2[1], -57.89895966720661, 0.001, "s1/s2 point2 lat");
    });

    it("finds nearest edge with Vincenty when lower bounds use haversine METERS_PER_DEGREE", () => {
      const p: Geometry = { type: "Point", coordinates: [0, 0] };
      const b: Geometry = {
        type: "MultiLineString",
        coordinates: [
          [[0.9963, -1], [0.9963, 1]],  // planar seed ~110907 m, lon-edge
          [[-1, 1.0], [1, 1.0]],        // true nearest ~110574 m, lat-edge
        ],
      };
      expectCloseRatio(
        ensureSymmetricDistance(p, b, "Vincenty avoids over-pruning lat bounds", "vincenty"),
        110574.39,
        0.001,
        "Vincenty avoids over-pruning lat bounds",
      );
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

  describe("performance sanity", () => {
    it("resolves two disjoint 500-vertex polygons in under a second", () => {
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
      expect(elapsedMs).toBeLessThan(1_000);
    });

    it("resolves two nearby irregular ~5000-vertex polygons in under a second", () => {
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

      const a = blob(2.0, 48.0, 0.5, 5000, 1);
      const b = blob(4.0, 48.3, 0.5, 5000, 2);

      const start = performance.now();
      const result = distance(a, b);
      const elapsedMs = performance.now() - start;

      expect(result.distance).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(1_000);
    });
  });
});
