import { describe, expect, it } from "vitest";

import distance, { splitIntoFlatGeometries } from "../../src/helpers/distance.js";
import type { GeometryCollection, LineString, MultiLineString, MultiPoint, MultiPolygon, Polygon, Point } from "geojson";
import { besancon, chamonix, marseille, paris, parisMarseille } from "../samples";

describe("Test distance",() => {
    describe("Test distance(Point,Point)", () => {
        it("should return 662489.3m from Paris to Marseille",() => {
            const result = distance(paris,marseille);
            expect(result.distance).toBeCloseTo(662489.3,1);
            expect(result.point1).toEqual(paris.coordinates);
            expect(result.point2).toEqual(marseille.coordinates);
        });
    });
    describe("Test distance(Point,LineString)", () => {
        it("should return 209731.2m from Besançon to [Paris,Marseille]",() => {
            const result = distance(besancon,parisMarseille);
            expect(result.distance).toBeCloseTo(192749.6,1);
            expect(result.point1).toEqual(besancon.coordinates);
        });
    });

    describe("Regression tests for composite geometries", () => {
        it("should match Point->LineString distance when using MultiLineString", () => {
            const multiLine: MultiLineString = {
                type: "MultiLineString",
                coordinates: [
                    parisMarseille.coordinates,
                    [[10, 10], [11, 11]],
                ],
            };

            expect(distance(besancon, multiLine).distance).toBeCloseTo(distance(besancon, parisMarseille).distance, 3);
        });

        it("should return 0m when GeometryCollections intersect", () => {
            const containingPolygon: Polygon = {
                type: "Polygon",
                coordinates: [
                    [
                        [2.0, 48.0],
                        [3.0, 48.0],
                        [3.0, 49.0],
                        [2.0, 49.0],
                        [2.0, 48.0],
                    ],
                ],
            };

            const gcA: GeometryCollection = {
                type: "GeometryCollection",
                geometries: [
                    paris,
                    { type: "LineString", coordinates: [[0, 0], [0.5, 0.5]] },
                ],
            };

            const gcB: GeometryCollection = {
                type: "GeometryCollection",
                geometries: [containingPolygon],
            };

            expect(distance(gcA, gcB).distance).toBe(0);
        });

        it("should be symmetric for composite geometries", () => {
            const multiLine: MultiLineString = {
                type: "MultiLineString",
                coordinates: [
                    parisMarseille.coordinates,
                    [[7.5, 46.0], [7.8, 46.3]],
                ],
            };
            const multiPolygon: MultiPolygon = {
                type: "MultiPolygon",
                coordinates: [
                    [
                        [
                            [1.8, 48.2],
                            [2.8, 48.2],
                            [2.8, 49.1],
                            [1.8, 49.1],
                            [1.8, 48.2],
                        ],
                    ],
                    [
                        [
                            [6.6, 45.6],
                            [7.1, 45.6],
                            [7.1, 46.0],
                            [6.6, 46.0],
                            [6.6, 45.6],
                        ],
                    ],
                ],
            };

            const d1 = distance(multiLine, multiPolygon).distance;
            const d2 = distance(multiPolygon, multiLine).distance;
            expect(d1).toBeCloseTo(d2, 6);
        });

        it("should compute MultiPoint distances via point fallback", () => {
            const a: MultiPoint = {
                type: "MultiPoint",
                coordinates: [paris.coordinates, marseille.coordinates],
            };
            const b: MultiPoint = {
                type: "MultiPoint",
                coordinates: [chamonix.coordinates, paris.coordinates],
            };

            expect(distance(a, b).distance).toBe(0);
        });
    });

    describe("Test distance includes vertices of geometries", () => {
        it("should consider LineString vertices as candidate points", () => {
            // LineString: vertex at [2.0, 48.0], then to [4.0, 50.0]
            const lineString: LineString = {
                type: "LineString",
                coordinates: [[2.0, 48.0], [4.0, 50.0]],
            };
            // Point very close to the first vertex (within 100m)
            const point: Point = {
                type: "Point",
                coordinates: [2.0000001, 48.0000001],
            };

            const result = distance(point, lineString);
            // Distance should be very small (close to the vertex), not the distance to the line segment
            expect(result.distance).toBeLessThan(50);
        });

        it("should consider Polygon vertices as candidate points", () => {
            // Polygon with a vertex at [2.0, 48.0]
            const polygon: Polygon = {
                type: "Polygon",
                coordinates: [
                    [
                        [2.0, 48.0],
                        [4.0, 48.0],
                        [4.0, 50.0],
                        [2.0, 50.0],
                        [2.0, 48.0],
                    ],
                ],
            };
            // Point very close to the first vertex
            const point: Point = {
                type: "Point",
                coordinates: [2.0000001, 48.0000001],
            };

            const result = distance(point, polygon);
            // Distance should be very small (close to the vertex), not the distance to the polygon edge
            expect(result.distance).toBeLessThan(50);
        });
    });

    describe("Test splitIntoFlatGeometries", () => {
        it("should extract vertices from LineStrings as Point geometries", () => {
            const line: LineString = {
                type: "LineString",
                coordinates: [[0, 0], [1, 1], [2, 0]],
            };
            const result = splitIntoFlatGeometries(line);
            
            // Should have extracted 3 vertices as points
            expect(result.points.length).toBe(3);
            expect(result.points).toEqual([
                { type: "Point", coordinates: [0, 0] },
                { type: "Point", coordinates: [1, 1] },
                { type: "Point", coordinates: [2, 0] },
            ]);
            
            // Should also have the linestring itself
            expect(result.lineStrings.length).toBe(1);
            expect(result.lineStrings[0]).toEqual(line);
            
            // Should have no polygons
            expect(result.polygons.length).toBe(0);
        });

        it("should extract vertices from Polygon rings as Point geometries and keep polygon", () => {
            const polygon: Polygon = {
                type: "Polygon",
                coordinates: [
                    [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
                ],
            };
            const result = splitIntoFlatGeometries(polygon);
            
            // Should have extracted 5 vertices as points (including the closing point)
            expect(result.points.length).toBe(5);
            expect(result.points).toEqual([
                { type: "Point", coordinates: [0, 0] },
                { type: "Point", coordinates: [1, 0] },
                { type: "Point", coordinates: [1, 1] },
                { type: "Point", coordinates: [0, 1] },
                { type: "Point", coordinates: [0, 0] },
            ]);
            
            // Should have converted polygon ring to a linestring
            expect(result.lineStrings.length).toBe(1);
            expect(result.lineStrings[0]).toEqual({
                type: "LineString",
                coordinates: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
            });
            
            // Should have the polygon itself
            expect(result.polygons.length).toBe(1);
            expect(result.polygons[0]).toEqual(polygon);
        });
    });

    describe("Test point-in-polygon detection", () => {
        it("should return 0 with point coordinates when point is inside polygon", () => {
            // This test verifies that we return the actual point coordinates [5, 5]
            const polygon: Polygon = {
                type: "Polygon",
                coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
            };
            const pointInside: Point = {
                type: "Point",
                coordinates: [5, 5],
            };

            const result = distance(pointInside, polygon);
            expect(result.distance).toBe(0);
            // Verify we return actual point coordinates, not dummy [0, 0]
            expect(result.point1).toEqual([5, 5]);
            expect(result.point2).toEqual([5, 5]);
        });

        it("should return 0 with proper coordinates when polygon contains point", () => {
            const polygon: Polygon = {
                type: "Polygon",
                coordinates: [[[2.0, 48.0], [3.0, 48.0], [3.0, 49.0], [2.0, 49.0], [2.0, 48.0]]],
            };
            // Paris is at [2.3488, 48.8534]
            const result = distance(paris, polygon);
            expect(result.distance).toBe(0);
            expect(result.point1).toEqual(paris.coordinates);
            expect(result.point2).toEqual(paris.coordinates);
        });

        it("should detect containment in MultiPolygon", () => {
            const multiPolygon: MultiPolygon = {
                type: "MultiPolygon",
                coordinates: [
                    [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
                    [[[10, 10], [15, 10], [15, 15], [10, 15], [10, 10]]],
                ],
            };
            const pointInFirstPoly: Point = {
                type: "Point",
                coordinates: [1, 1],
            };

            const result = distance(pointInFirstPoly, multiPolygon);
            expect(result.distance).toBe(0);
            expect(result.point1).toEqual([1, 1]);
            expect(result.point2).toEqual([1, 1]);
        });

        it("should handle point outside polygon (normal distance)", () => {
            const polygon: Polygon = {
                type: "Polygon",
                coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
            };
            const pointOutside: Point = {
                type: "Point",
                coordinates: [10, 10],
            };

            const result = distance(pointOutside, polygon);
            expect(result.distance).toBeGreaterThan(0);
            // Coordinates should not be dummy [0, 0]
            expect(result.point1).toEqual([10, 10]);
            expect([result.point2[0], result.point2[1]]).not.toEqual([0, 0]);
        });
    });

    describe("Test line-line segment intersection detection", () => {
        it("should return 0 with intersection point for crossing LineStrings", () => {
            const line1: LineString = {
                type: "LineString",
                coordinates: [[0, 0], [10, 10]],
            };
            const line2: LineString = {
                type: "LineString",
                coordinates: [[0, 10], [10, 0]],
            };

            const result = distance(line1, line2);
            expect(result.distance).toBe(0);
            // Intersection should be at approximately [5, 5]
            expect(result.point1).toEqual(result.point2);
            expect(result.point1[0]).toBeCloseTo(5, 1);
            expect(result.point1[1]).toBeCloseTo(5, 1);
        });

        it("should return 0 with intersection point when line crosses polygon edge", () => {
            const polygon: Polygon = {
                type: "Polygon",
                coordinates: [[[1, 1], [5, 1], [5, 5], [1, 5], [1, 1]]],
            };
            const crossingLine: LineString = {
                type: "LineString",
                coordinates: [[0, 3], [6, 3]],
            };

            const result = distance(crossingLine, polygon);
            expect(result.distance).toBe(0);
            // Intersection should be on the line
            expect(result.point1).toEqual(result.point2);
            expect(result.point2[1]).toBeCloseTo(3, 2);
        });

        it("should handle parallel non-intersecting lines", () => {
            const line1: LineString = {
                type: "LineString",
                coordinates: [[1, 1], [11, 1]],
            };
            const line2: LineString = {
                type: "LineString",
                coordinates: [[1, 6], [11, 6]],
            };

            const result = distance(line1, line2);
            expect(result.distance).toBeGreaterThan(0);
            // For parallel lines, should find closest vertex pair
            // point1 should be from line1, point2 from line2 - verify they're valid coordinates
            expect(result.point1[0]).toBeGreaterThanOrEqual(1);
            expect(result.point1[0]).toBeLessThanOrEqual(11);
            expect(result.point2[0]).toBeGreaterThanOrEqual(1);
            expect(result.point2[0]).toBeLessThanOrEqual(11);
        });

        it("should handle multiple line segments with intersection in middle", () => {
            const line1: LineString = {
                type: "LineString",
                coordinates: [[0, 0], [5, 5], [10, 10]],
            };
            const line2: LineString = {
                type: "LineString",
                coordinates: [[0, 10], [5, 5], [10, 0]],
            };

            const result = distance(line1, line2);
            expect(result.distance).toBe(0);
            // Should find one of the intersections
            expect(result.point1).toEqual(result.point2);
        });

        it("should return 0 with actual coordinates for complex intersecting geometry", () => {
            const geom1: LineString = {
                type: "LineString",
                coordinates: [[2.0, 48.0], [3.0, 49.0]],
            };
            const geom2: Polygon = {
                type: "Polygon",
                coordinates: [[[2.5, 48.0], [3.5, 48.0], [3.5, 49.0], [2.5, 49.0], [2.5, 48.0]]],
            };

            const result = distance(geom1, geom2);
            expect(result.distance).toBe(0);
            // When distance is 0, point1 should equal point2
            expect(result.point1).toEqual(result.point2);
            // Verify coordinates are not dummy [0, 0]
            expect(result.point1).not.toEqual([0, 0]);
            expect(result.point2).not.toEqual([0, 0]);
        });

        it("should handle colinear overlapping lines with distance 0", () => {
            const line1: LineString = {
                type: "LineString",
                coordinates: [[0, 0], [10, 0]],
            };
            const line2: LineString = {
                type: "LineString",
                coordinates: [[5, 0], [15, 0]],
            };

            const result = distance(line1, line2);
            expect(result.distance).toBe(0);
            // Overlapping colinear lines have intersection point within floating point precision
            expect(result.point1[0]).toBeCloseTo(result.point2[0], 10);
            expect(result.point1[1]).toBeCloseTo(result.point2[1], 10);
            // Intersection should be in the overlap region [5, 10] at y=0
            expect(result.point1[1]).toBeCloseTo(0, 10);
            expect(result.point1[0]).toBeGreaterThanOrEqual(5);
            expect(result.point1[0]).toBeLessThanOrEqual(10);
        });

        it("should handle colinear non-overlapping lines with positive distance", () => {
            const line1: LineString = {
                type: "LineString",
                coordinates: [[0, 0], [5, 0]],
            };
            const line2: LineString = {
                type: "LineString",
                coordinates: [[10, 0], [15, 0]],
            };

            const result = distance(line1, line2);
            expect(result.distance).toBeGreaterThan(0);
            // Closest points should both be at y=0 (colinear on x-axis)
            expect(result.point1[1]).toBe(0);
            expect(result.point2[1]).toBe(0);
            // Point1 and point2 should both be from the valid coordinate ranges
            const point1XInRange = (result.point1[0] >= 0 && result.point1[0] <= 5) || (result.point1[0] >= 10 && result.point1[0] <= 15);
            const point2XInRange = (result.point2[0] >= 0 && result.point2[0] <= 5) || (result.point2[0] >= 10 && result.point2[0] <= 15);
            expect(point1XInRange && point2XInRange).toBe(true);
        });

        it("should return 0 when line is identical to polygon side", () => {
            const polygon: Polygon = {
                type: "Polygon",
                coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
            };
            const line: LineString = {
                type: "LineString",
                coordinates: [[0, 0], [10, 0]],
            };

            const result = distance(line, polygon);
            expect(result.distance).toBe(0);
            // Line shares the same coordinates as polygon side
            expect(result.point1).toEqual(result.point2);
            expect(result.point1[1]).toBe(0);
            expect(result.point1[0]).toBeGreaterThanOrEqual(0);
            expect(result.point1[0]).toBeLessThanOrEqual(10);
        });
    });
});
