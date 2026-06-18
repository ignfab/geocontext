import { describe, expect, it } from "vitest";

import distance, { splitIntoPointsAndLineStrings } from "../../src/helpers/distance.js";
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

    describe("Test splitIntoPointsAndLineStrings", () => {
        it("should extract vertices from LineStrings as Point geometries", () => {
            const line: LineString = {
                type: "LineString",
                coordinates: [[0, 0], [1, 1], [2, 0]],
            };
            const result = splitIntoPointsAndLineStrings(line);
            
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
        });

        it("should extract vertices from Polygon rings as Point geometries", () => {
            const polygon: Polygon = {
                type: "Polygon",
                coordinates: [
                    [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
                ],
            };
            const result = splitIntoPointsAndLineStrings(polygon);
            
            // Should have extracted 5 vertices as points (including the closing point)
            expect(result.points.length).toBe(5);
            expect(result.points).toEqual([
                { type: "Point", coordinates: [0, 0] },
                { type: "Point", coordinates: [1, 0] },
                { type: "Point", coordinates: [1, 1] },
                { type: "Point", coordinates: [0, 1] },
                { type: "Point", coordinates: [0, 0] },
            ]);
            
            // Should have converted polygon to linestring(s)
            expect(result.lineStrings.length).toBe(1);
            expect(result.lineStrings[0].type).toBe("LineString");
        });
    });
});
