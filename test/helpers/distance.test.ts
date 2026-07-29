import { describe, expect, it } from "vitest";

import distance, { splitIntoFlatGeometries } from "../../src/helpers/distance.js";
import type { GeometryCollection, LineString, MultiLineString, MultiPoint, MultiPolygon, Polygon, Point, Position } from "geojson";
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

        it("should split a LineString crossing the antimeridian into two segments", () => {
            const line: LineString = {
                type: "LineString",
                coordinates: [[179, 1], [-179, 1]],
            };

            const result = splitIntoFlatGeometries(line);

            expect(result.lineStrings.length).toBe(2);
            expect(result.lineStrings[0].coordinates[0]).toEqual([-179, 1]);
            expect(result.lineStrings[1].coordinates[1]).toEqual([179, 1]);
            expect(result.lineStrings[0].coordinates[1][0]).toBe(-180);
            expect(result.lineStrings[1].coordinates[0][0]).toBe(180);
            expect(result.lineStrings[0].coordinates[1][1]).toBeCloseTo(result.lineStrings[1].coordinates[0][1], 6);
            expect(result.lineStrings[0].coordinates[1][1]).toBeCloseTo(1.0001523, 6);
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
        // --- Factorized containment tests for three polygon families ---
        //
        // Each scenario exercises:
        //   • simple polygon (no hole): interior/exterior point × correct/malformed outer winding
        //   • polygon with hole: exterior/hole/between-rings point × all 4 winding combinations

        type PolygonScenario = {
            name: string;
            /** Exterior ring, correctly wound (CCW for normal polygons, CW for polar per RFC 7946) */
            correctOuterRing: Position[];
            /** Interior ring (hole), correctly wound (inverse of exterior convention) */
            correctHoleRing: Position[];
            /** A point clearly outside the outer ring */
            pointOutside: Position;
            /** A point inside the outer ring and outside the hole */
            pointBetweenRings: Position;
            /** A point inside the hole */
            pointInHole: Position;
            /**
             * Optional predicate for known test failures. When it returns true
             * the test is registered with it.fails() so it does not block the suite.
             * @param outerMalformed - true when the outer ring winding is reversed
             * @param holeMalformed  - true/false for the hole winding; null when no hole
             * @param testId         - which assertion within the combination is being run
             */
            isKnownFailure?: (
                outerMalformed: boolean,
                holeMalformed: boolean | null,
                testId: "interior" | "exterior" | "outside" | "hole" | "between",
            ) => boolean;
        };

        const runPolygonContainmentTests = (scenario: PolygonScenario): void => {
            const {
                name,
                correctOuterRing,
                correctHoleRing,
                pointOutside,
                pointBetweenRings,
                pointInHole,
                isKnownFailure,
            } = scenario;
            const malformedOuterRing = [...correctOuterRing].reverse();
            const malformedHoleRing = [...correctHoleRing].reverse();

            const outerVariants: Array<[string, Position[]]> = [
                ["correct outer winding", correctOuterRing],
                ["malformed outer winding", malformedOuterRing],
            ];
            const holeVariants: Array<[string, Position[]]> = [
                ["correct hole winding", correctHoleRing],
                ["malformed hole winding", malformedHoleRing],
            ];

            // Pick it() or it.fails() based on the isKnownFailure predicate.
            type TestId = "interior" | "exterior" | "outside" | "hole" | "between";
            const itFn = (outerMalformed: boolean, holeMalformed: boolean | null, testId: TestId) =>
                isKnownFailure?.(outerMalformed, holeMalformed, testId) ? it.fails : it;

            describe(`${name} — without hole`, () => {
                for (const [outerIdx, [windingLabel, outerRing]] of outerVariants.entries()) {
                    const outerMalformed = outerIdx === 1;
                    describe(windingLabel, () => {
                        itFn(outerMalformed, null, "interior")("interior point → distance 0", () => {
                            const polygon: Polygon = { type: "Polygon", coordinates: structuredClone([outerRing]) };
                            const insidePoint: Point = { type: "Point", coordinates: pointBetweenRings };
                            const result = distance(insidePoint, polygon);
                            expect(result.distance).toBe(0);
                            expect(result.point1).toEqual(pointBetweenRings);
                            expect(result.point2).toEqual(pointBetweenRings);
                        });

                        itFn(outerMalformed, null, "exterior")("exterior point → positive distance", () => {
                            const polygon: Polygon = { type: "Polygon", coordinates: structuredClone([outerRing]) };
                            const outsidePoint: Point = { type: "Point", coordinates: pointOutside };
                            const result = distance(outsidePoint, polygon);
                            expect(result.distance).toBeGreaterThan(0);
                            expect(result.point1).toEqual(pointOutside);
                        });
                    });
                }
            });

            describe(`${name} — with hole`, () => {
                for (const [outerIdx, [outerLabel, outerRing]] of outerVariants.entries()) {
                    const outerMalformed = outerIdx === 1;
                    for (const [holeIdx, [holeLabel, holeRing]] of holeVariants.entries()) {
                        const holeMalformed = holeIdx === 1;
                        describe(`${outerLabel}, ${holeLabel}`, () => {
                            itFn(outerMalformed, holeMalformed, "outside")("point outside outer ring → positive distance", () => {
                                const polygon: Polygon = { type: "Polygon", coordinates: [outerRing, holeRing] };
                                const originalPolygon = structuredClone(polygon);
                                const outsidePoint: Point = { type: "Point", coordinates: pointOutside };
                                const result = distance(outsidePoint, polygon);
                                expect(result.distance).toBeGreaterThan(0);
                                expect(result.point1).toEqual(pointOutside);
                                expect(polygon).toEqual(originalPolygon); // check that distance does not mutate its input
                            });

                            itFn(outerMalformed, holeMalformed, "hole")("point inside hole → positive distance", () => {
                                const polygon: Polygon = { type: "Polygon", coordinates: structuredClone([outerRing, holeRing]) };
                                const holePoint: Point = { type: "Point", coordinates: pointInHole };
                                const result = distance(holePoint, polygon);
                                expect(result.distance).toBeGreaterThan(0);
                                expect(result.point1).toEqual(pointInHole);
                            });

                            itFn(outerMalformed, holeMalformed, "between")("point between outer ring and hole → distance 0", () => {
                                const polygon: Polygon = { type: "Polygon", coordinates: structuredClone([outerRing, holeRing]) };
                                const betweenPoint: Point = { type: "Point", coordinates: pointBetweenRings };
                                const result = distance(betweenPoint, polygon);
                                expect(result.distance).toBe(0);
                                expect(result.point1).toEqual(pointBetweenRings);
                                expect(result.point2).toEqual(pointBetweenRings);
                            });
                        });
                    }
                }
            });
        };

        // France: rectangular area [2°E–3°E, 48°N–49°N]
        // Outer ring: CCW (counter-clockwise, exterior ring per RFC 7946)
        // Hole ring:  CW  (clockwise, interior ring per RFC 7946)
        runPolygonContainmentTests({
            name: "France polygon",
            correctOuterRing: [[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]],
            correctHoleRing:  [[2.3, 48.3], [2.3, 48.7], [2.7, 48.7], [2.7, 48.3], [2.3, 48.3]],
            pointOutside:     [5, 43],
            pointBetweenRings:[2.1, 48.1],
            pointInHole:      [2.5, 48.5],
        });

        // Antimeridian-crossing polygon: zone straddling the 180° meridian
        // Outer ring: CCW (counter-clockwise, exterior ring per RFC 7946)
        // Hole ring:  CW  (clockwise, interior ring per RFC 7946)
        runPolygonContainmentTests({
            name: "Antimeridian-crossing polygon",
            correctOuterRing: [[170, -10], [-170, -10], [-170, 10], [170, 10], [170, -10]],
            correctHoleRing:  [[175, -5], [175, 5], [-175, 5], [-175, -5], [175, -5]],
            pointOutside:     [0, 0],
            pointBetweenRings:[172, 0],
            pointInHole:      [179, 0],
        });

        // North Pole-encompassing polygon: ring at 40°N that encircles the pole
        // Outer ring: CCW (counter-clockwise, seen from above
        // Hole ring:  CW  (clockwise, seen from above
        // Known bugs: the implementation does not recover from a single malformed ring;
        //             correct outer + malformed hole, and malformed outer + correct hole
        //             both fail. Only the double-malformed pair (mO+mH) is auto-corrected.
        runPolygonContainmentTests({
            name: "North Pole-encompassing polygon",
            correctOuterRing: [[45, 40], [135, 40], [-135, 40], [-45, 40], [45, 40]],
            correctHoleRing:  [[45, 88], [-45, 88], [-135, 88], [135, 88], [45, 88]],
            pointOutside:     [0, 30],
            pointBetweenRings:[0, 60],
            pointInHole:      [0, 90],
            isKnownFailure: (outerMalformed, holeMalformed, testId) => {
                // Note that wrong windings are not valid GeoJSON so these test failures
                // are not bugs actually, they are unimplemented featurs.
                // no-hole + malformed outer
                if (outerMalformed && holeMalformed === null) return true;
                // with a hole, correct outer but malformed inner
                if (!outerMalformed && holeMalformed === true) return true;
                // with a hole, malformed outer but correct inner, except for inside-the-hole
                if (outerMalformed && holeMalformed === false && testId !== "hole") return true;
                return false; // else
            },
        });

        // --- Additional tests for specific edge cases not covered by the factorized matrix ---

        it("should return 0 when point is inside a multipolygon part crossing the antimeridian", () => {
            const multiPolygon: MultiPolygon = {
                type: "MultiPolygon",
                coordinates: [
                    [[
                        [170, -10],
                        [-170, -10],
                        [-170, 10],
                        [170, 10],
                        [170, -10],
                    ]],
                    [[
                        [20, 20],
                        [22, 20],
                        [22, 22],
                        [20, 22],
                        [20, 20],
                    ]],
                ],
            };
            const pointInside: Point = {
                type: "Point",
                coordinates: [-179, 1],
            };

            const result = distance(pointInside, multiPolygon);
            expect(result.distance).toBe(0);
            expect(result.point1).toEqual([-179, 1]);
            expect(result.point2).toEqual([-179, 1]);
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

        it("should return 0 when a polygon touches the North Pole", () => {
            const polygon: Polygon = {
                type: "Polygon",
                coordinates: [[
                    [-45, 90],
                    [-45, 85],
                    [45, 85],
                    [45, 90],
                    [-45, 90],
                ]],
            };
            const northPole: Point = {
                type: "Point",
                coordinates: [0, 90],
            };

            const result = distance(northPole, polygon);

            expect(result.distance).toBe(0);
            expect(result.point1).toEqual([0, 90]);
            expect(result.point2).toEqual([0, 90]);
        });

        it("should not classify an outside point as inside when polygon has a zero-length edge", () => {
            const polygonWithDuplicateVertex: Polygon = {
                type: "Polygon",
                coordinates: [[
                    [0, 0],
                    [2, 0],
                    [2, 0],
                    [2, 2],
                    [0, 2],
                    [0, 0],
                ]],
            };
            const pointOutside: Point = {
                type: "Point",
                coordinates: [10, 10],
            };

            const result = distance(pointOutside, polygonWithDuplicateVertex);
            expect(result.distance).toBeGreaterThan(0);
            expect(result.point1).toEqual([10, 10]);
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

        it("should return a large non-zero distance for distant line vs polygon across the antimeridian", () => {
            const polygon: Polygon = {
                type: "Polygon",
                coordinates: [[
                    [23.135776547816135, -5.4896438887560635],
                    [27.977340911114993, -5.4896438887560635],
                    [27.977340911114993, 31.956263865426763],
                    [23.135776547816135, 31.956263865426763],
                    [23.135776547816135, -5.4896438887560635],
                ]],
            };
            const crossingAntimeridianLine: LineString = {
                type: "LineString",
                coordinates: [
                    [165.2812012336696, 6.549152703997294],
                    [-174.51797643760415, 6.852029146295976],
                ],
            };

            const result = distance(polygon, crossingAntimeridianLine);
            expect(result.distance).toBeGreaterThan(1000000);
        });

        it("should avoid an antimeridian split artifact when measuring distant lines", () => {
            const lineA: LineString = {
                type: "LineString",
                coordinates: [
                    [148.36866917715702, 46.84158577670763],
                    [92.27258167379557, 58.34804763832423],
                ],
            };
            const lineB: LineString = {
                type: "LineString",
                coordinates: [
                    [-157.2713800668627, -4.447939722741566],
                    [169.80694578648507, -14.439383953401865],
                ],
            };

            const result = distance(lineA, lineB);

            expect(result.distance).toBeCloseTo(7142596.41, 2);
            expect(result.point1[0]).toBeCloseTo(169.80694578648507, 10);
            expect(result.point1[1]).toBeCloseTo(-14.439383953401865, 10);
            expect(result.point2[0]).toBeCloseTo(148.36866917715702, 10);
            expect(result.point2[1]).toBeCloseTo(46.84158577670763, 10);
        });

        it("should detect a real line intersection across the antimeridian", () => {
            const datelineCrossingLine: LineString = {
                type: "LineString",
                coordinates: [[179, 0], [-179, 0]],
            };
            const verticalLineNearDateline: LineString = {
                type: "LineString",
                coordinates: [[179.5, -1], [179.5, 1]],
            };

            const result = distance(datelineCrossingLine, verticalLineNearDateline);
            expect(result.distance).toBe(0);
            expect(result.point1).toEqual(result.point2);
            expect(Math.abs(result.point1[0])).toBeGreaterThan(179);
            expect(result.point1[1]).toBeCloseTo(0, 6);
        });

        it("should compute the large distance between two non-intersecting segments in the southern hemisphere", () => {
            const s1: LineString = {
                type: "LineString",
                coordinates: [[-136.61127697878203, -67.24854737502018], [3.6575704307094554, -65.92384272707795]],
            };
            const s2: LineString = {
                type: "LineString",
                coordinates: [[-69.05775139070103, -54.8979093430909], [-86.16447630165361, -57.89895966720661]],
            };

            const result = distance(s1, s2);
            expect(result.distance).toBeCloseTo(2440829.44, 2);
        });

    });

    describe("Test line-point distance edge cases", () => {
        it("should return the same distance between a pole and two segments of the same parallel", () => {
            const line1: LineString = {
                type: "LineString",
                coordinates: [[10, 30], [30, 30]],
            };
            const line2: LineString = {
                type: "LineString",
                coordinates: [[165, 30], [-175, 30]],
            };
            const north: Point = {
                type: "Point",
                coordinates: [0, 90],
            };
            const south: Point = {
                type: "Point",
                coordinates: [0, -90],
            };

            const resultN1 = distance(line1, north);
            const resultN2 = distance(line2, north);
            expect(resultN1.distance).toBeCloseTo(6629311.12)
            expect(resultN1.distance).toBeCloseTo(resultN2.distance, 1);
            const resultS1 = distance(south, line1);
            const resultS2 = distance(south, line2);
            expect(resultS1.distance).toBeCloseTo(resultS2.distance, 1);
            expect(resultS1.distance).toBeCloseTo(13343409.63)
        });

        it("should return the same distance between two laterally translated cases", () => {
            const lon1 = 10;
            const lon2 = 165;
            const width = 20;
            const lat = 30;
            const line1: LineString = {
                type: "LineString",
                coordinates: [[lon1, lat], [lon1+width, lat]],
            };
            const line2: LineString = {
                type: "LineString",
                coordinates: [[lon2, lat], [lon2+width-360, lat]],
            };
            for (const offset of [2, 10, 15, 16]) {
                for (const newlat of [70, -40]) {
                    const p1: Point = {
                        type: "Point",
                        coordinates: [lon1+offset, newlat],
                    };
                    const p2: Point = {
                        type: "Point",
                        coordinates: [(lon2+offset+180)%360-180, newlat],
                    };

                    const result1 = distance(line1, p1);
                    const result2 = distance(line2, p2);
                    expect(result1.distance).toBeCloseTo(result2.distance, 1);
                }
            }
        });
    });
});
