import { describe, expect, it } from "vitest";
import { intersect } from "@turf/intersect";
import { feature, featureCollection } from "@turf/helpers";
import type { MultiPolygon, Polygon, Position } from "geojson";

import area from "../../src/helpers/area.js";
import { InvalidGeometryError, makeIntersectionArea } from "../../src/helpers/intersectionArea.js";

function rectangle(west: number, south: number, east: number, north: number) : Position[] {
  return [[west, south], [east, south], [east, north], [west, north], [west, south]];
}

function wavyRing(centerLon: number, centerLat: number, radius: number, vertices: number, waves: number) : Position[] {
  const positions = Array.from({ length: vertices }, (_, index) => {
    const angle = (Math.PI * 2 * index) / vertices;
    const wavyRadius = radius * (1 + 0.05 * Math.sin(waves * angle));
    return [centerLon + wavyRadius * Math.cos(angle), centerLat + wavyRadius * Math.sin(angle)];
  });
  return [...positions, positions[0]];
}

function polyclipArea(a: Polygon | MultiPolygon, b: Polygon | MultiPolygon) : number {
  const inter = intersect(featureCollection<Polygon | MultiPolygon>([feature(a), feature(b)]));
  return inter == null ? 0 : area(inter.geometry);
}

describe("helpers/intersectionArea", () => {
  const filter: Polygon = { type: "Polygon", coordinates: [rectangle(2, 48, 3, 49)] };

  it("should sum the overlapping polygons of a MultiPolygon, as area does", () => {
    const overlapping: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [[rectangle(2.2, 48.2, 2.6, 48.6)], [rectangle(2.4, 48.4, 2.8, 48.8)]],
    };
    const intersectionArea = makeIntersectionArea(filter);

    expect(intersectionArea(overlapping)).toEqual(area(overlapping));

    // Shifted across the eastern edge: each polygon is clipped on its own.
    const crossing: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [[rectangle(2.8, 48.2, 3.2, 48.6)], [rectangle(2.9, 48.4, 3.3, 48.8)]],
    };
    const expected = area({ type: "MultiPolygon", coordinates: [[rectangle(2.8, 48.2, 3, 48.6)], [rectangle(2.9, 48.4, 3, 48.8)]] });
    expect(intersectionArea(crossing)).toBeCloseTo(expected, 3);
  });

  it("should match general polygon clipping on detailed geometries crossing each other", () => {
    const reference: Polygon = { type: "Polygon", coordinates: [wavyRing(2.35, 48.85, 0.3, 5000, 150)] };
    const intersectionArea = makeIntersectionArea(reference);

    for (const [lon, lat] of [[2.65, 48.85], [2.35, 48.55], [2.1, 49.05]]) {
      const geo: Polygon = { type: "Polygon", coordinates: [wavyRing(lon, lat, 0.12, 3000, 90)] };
      const expected = polyclipArea(geo, reference);

      expect(Math.abs(intersectionArea(geo) - expected) / area(geo)).toBeLessThan(1e-9);
    }
  });

  it("should ignore repeated positions", () => {
    // Both boundaries pass through the tip of a notch, repeated on both sides: the
    // repetitions all end in the deepest boxes around it.
    const tip: Position = [2.95, 48.5];
    const withTip = (times: number) => Array.from({ length: times }, () => tip);
    const notchedFilter = (times: number) : Polygon => ({ type: "Polygon", coordinates: [[[2, 48], [3, 48], ...withTip(times), [3, 49], [2, 49], [2, 48]]] });
    const notchedGeo = (times: number) : Polygon => ({ type: "Polygon", coordinates: [[[2.9, 48.45], [3.05, 48.45], ...withTip(times), [3.05, 48.55], [2.9, 48.55], [2.9, 48.45]]] });

    expect(makeIntersectionArea(notchedFilter(100000))(notchedGeo(100000))).toEqual(makeIntersectionArea(notchedFilter(1))(notchedGeo(1)));
  });

  it("should reject a self-intersecting filter", () => {
    const bowTie: Polygon = {
      type: "Polygon",
      coordinates: [[[2, 48], [3, 49], [3, 48], [2, 49], [2, 48]]],
    };

    expect(() => makeIntersectionArea(bowTie)).toThrow(InvalidGeometryError);
  });

  it("should reject a self-intersecting geometry whose part inside the filter has the wrong orientation", () => {
    // Figure eight: its larger lobe, counterclockwise, lies mostly east of the filter, its
    // smaller lobe, clockwise, inside it, so that the piece west of the eastern edge is clockwise.
    const larger = Array.from({ length: 40 }, (_, index) => {
      const angle = Math.PI + (Math.PI * 2 * index) / 40;
      return [3.08 + 0.1 * Math.cos(angle), 48.5 + 0.1 * Math.sin(angle)];
    });
    const smaller = Array.from({ length: 40 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 40;
      return [2.95 + 0.03 * Math.cos(angle), 48.5 - 0.03 * Math.sin(angle)];
    });
    const figureEight: Polygon = { type: "Polygon", coordinates: [[...larger, ...smaller, larger[0]]] };

    expect(() => makeIntersectionArea(filter)(figureEight)).toThrow(InvalidGeometryError);
  });
});
